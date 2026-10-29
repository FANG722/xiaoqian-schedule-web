import { formatLongDate, parseISODate, parseSchedule } from "./parser.js";

const $ = (selector) => document.querySelector(selector);
const fileInput = $("#file-input");
const dropZone = $("#drop-zone");
const imagePreview = $("#image-preview");
const screenshotDateInput = $("#screenshot-date");
const ocrState = $("#ocr-state");
const ocrProgress = $("#ocr-progress");
const resultSection = $("#result-section");
const emptyState = $("#empty-state");
const messageBox = $("#message-box");
const textDetails = $("#text-details");
const recognizedText = $("#recognized-text");
const results = $("#results");
const titleInput = $("#event-title");
const locationInput = $("#event-location");
const eventDateInput = $("#event-date");
const eventTimeInput = $("#event-time");
const allDayBadge = $("#all-day-badge");
const downloadButton = $("#download-calendar");
const copyButton = $("#copy-result");

let currentResult = null;
let previewURL = null;

const today = new Date();
screenshotDateInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) analyzeImage(file);
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("is-dragging");
});

dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-dragging"));

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-dragging");
  const file = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/"));
  if (file) analyzeImage(file);
});

dropZone.addEventListener("click", (event) => {
  if (event.target !== fileInput) fileInput.click();
});

dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") fileInput.click();
});

screenshotDateInput.addEventListener("change", () => {
  if (recognizedText.value.trim()) runParser();
});

$("#parse-text").addEventListener("click", runParser);
$("#sample-button").addEventListener("click", loadSample);
$("#clear-image").addEventListener("click", clearImage);
downloadButton.addEventListener("click", downloadCalendar);
copyButton.addEventListener("click", copyResult);

for (const input of [titleInput, locationInput, eventDateInput, eventTimeInput]) {
  input.addEventListener("input", () => updateResultView());
}

eventDateInput.addEventListener("change", updateResultView);
eventTimeInput.addEventListener("change", updateResultView);

async function analyzeImage(file) {
  if (!file.type.startsWith("image/")) {
    showMessage("请选择图片文件。", "error");
    return;
  }
  if (file.size > 30 * 1024 * 1024) {
    showMessage("图片超过 30MB，请换一张较小的截图。", "error");
    return;
  }

  showPreview(file);
  showMessage("");
  setStatus("正在准备本机 OCR", true, 0);

  if (!window.Tesseract) {
    setStatus("OCR 组件加载失败", false);
    showMessage("OCR 组件没有加载成功。你仍然可以在下方展开文字并粘贴聊天内容。", "error");
    showTextEditor();
    return;
  }

  let worker;
  try {
    worker = await Tesseract.createWorker("chi_sim+eng", 1, {
      logger: (progress) => {
        const percent = Number.isFinite(progress.progress) ? Math.round(progress.progress * 100) : 0;
        const label = progress.status === "recognizing text" ? "正在识别中文文字" : "正在加载中文 OCR";
        setStatus(label, true, percent);
      }
    });
    const { data } = await worker.recognize(file);
    recognizedText.value = data.text.trim();
    setStatus("识别完成，正在推理日期", false, 100);
    showTextEditor();
    runParser();
  } catch (error) {
    console.error(error);
    setStatus("本机识别没有完成", false);
    showMessage("没能自动识别这张图片。可以展开下方的识别文本并粘贴聊天内容，再重新推理。", "error");
    showTextEditor();
  } finally {
    if (worker) await worker.terminate();
  }
}

function showPreview(file) {
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = URL.createObjectURL(file);
  imagePreview.src = previewURL;
  imagePreview.hidden = false;
  $("#preview-shell").hidden = false;
  $("#clear-image").hidden = false;
  $("#upload-label").textContent = "更换聊天截图";
}

function clearImage() {
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = null;
  fileInput.value = "";
  imagePreview.removeAttribute("src");
  imagePreview.hidden = true;
  $("#preview-shell").hidden = true;
  $("#clear-image").hidden = true;
  $("#upload-label").textContent = "选择聊天截图";
  setStatus("", false);
}

function runParser() {
  try {
    currentResult = parseSchedule(recognizedText.value, screenshotDateInput.value);
    fillResultForm(currentResult);
    renderInference(currentResult);
    resultSection.hidden = false;
    emptyState.hidden = true;
    showMessage("");
    setStatus("日期推理完成", false, 100);
    requestAnimationFrame(() => resultSection.scrollIntoView({ behavior: "smooth", block: "start" }));
  } catch (error) {
    currentResult = null;
    resultSection.hidden = true;
    emptyState.hidden = false;
    showMessage(error.message, "error");
  }
}

function fillResultForm(result) {
  titleInput.value = result.title;
  locationInput.value = result.location ?? "";
  eventDateInput.value = result.eventDateISO;
  eventTimeInput.value = `${String(result.hour).padStart(2, "0")}:${String(result.minute).padStart(2, "0")}`;
  eventTimeInput.disabled = !result.hasExplicitTime;
  updateResultView();
}

function updateResultView() {
  const date = parseISODate(eventDateInput.value);
  if (!date) return;
  $("#result-date").textContent = formatLongDate(date);
  const useTime = currentResult?.hasExplicitTime;
  allDayBadge.textContent = useTime ? `${eventTimeInput.value} · 原消息包含具体时刻` : "全天 · 原消息未注明具体时刻";
  allDayBadge.classList.toggle("timed", Boolean(useTime));
}

function renderInference(result) {
  results.replaceChildren();
  for (const [index, step] of result.steps.entries()) {
    const item = document.createElement("li");
    const number = document.createElement("span");
    number.className = "step-number";
    number.textContent = String(index + 1);
    const text = document.createElement("span");
    text.textContent = step;
    item.append(number, text);
    results.append(item);
  }

  const caution = $("#caution");
  caution.textContent = result.caution ?? "";
  caution.hidden = !result.caution;
}

function downloadCalendar() {
  if (!currentResult || !titleInput.value.trim()) {
    showMessage("请先填写日程标题。", "error");
    return;
  }

  const allDay = !eventTimeInput.disabled;
  const start = parseISODate(eventDateInput.value);
  if (!start) {
    showMessage("请选择有效的日程日期。", "error");
    return;
  }

  let dtStart;
  let dtEnd;
  if (allDay) {
    dtStart = `DTSTART:${eventDateInput.value.replaceAll("-", "")}`;
    const next = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 12);
    dtEnd = `DTEND:${toCompactDate(next)}`;
  } else {
    const [hour, minute] = eventTimeInput.value.split(":").map(Number);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), hour, minute + 60, 0);
    dtStart = `DTSTART:${eventDateInput.value.replaceAll("-", "")}T${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}00`;
    dtEnd = `DTEND:${toCompactDate(end)}T${String(end.getHours()).padStart(2, "0")}${String(end.getMinutes()).padStart(2, "0")}00`;
  }

  const now = new Date();
  const stamp = `${toCompactDate(now)}T${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}00Z`;
  const notes = [
    "由小钱截图识日程生成。",
    `日期表达式：${currentResult.datePhrase}`,
    `截图日期：${currentResult.screenshotDateLabel}`,
    `消息日期：${currentResult.messageDateLabel}`,
    "",
    "识别原文：",
    recognizedText.value.trim()
  ].join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Xiaoqian Schedule//ZH-CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${crypto.randomUUID()}@xiaoqian-schedule`,
    `DTSTAMP:${stamp}`,
    dtStart,
    dtEnd,
    `SUMMARY:${escapeICS(titleInput.value.trim())}`,
    `LOCATION:${escapeICS(locationInput.value.trim())}`,
    `DESCRIPTION:${escapeICS(notes)}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ];

  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${safeFilename(titleInput.value)}.ics`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  showMessage("日历文件已生成。打开它即可导入 Apple 日历。", "success");
}

async function copyResult() {
  const time = eventTimeInput.disabled ? "全天" : eventTimeInput.value;
  const text = [
    titleInput.value.trim(),
    `${formatLongDate(parseISODate(eventDateInput.value))} ${time}`,
    locationInput.value.trim()
  ].filter(Boolean).join("\n");
  try {
    await navigator.clipboard.writeText(text);
    showMessage("日程信息已复制。", "success");
  } catch {
    showMessage("浏览器没有允许复制，请手动选择文字。", "error");
  }
}

function loadSample() {
  clearImage();
  recognizedText.value = `各位同学中午好：
受团课学习要求，需要大家参加
征信计划的开营仪式（大一同学完整
参与征信计划）作为团课学习一部
分，暂定于下周四在南望山大活进
行。
昨天 11:56`;
  screenshotDateInput.value = "2026-10-29";
  showTextEditor();
  runParser();
}

function showTextEditor() {
  textDetails.open = Boolean(recognizedText.value.trim());
}

function setStatus(label, busy, progress = 0) {
  ocrState.hidden = !label;
  ocrProgress.hidden = !busy;
  $("#ocr-status-label").textContent = label;
  $("#ocr-percent").textContent = busy ? `${progress}%` : "";
  $("#ocr-meter").style.width = `${Math.max(3, progress)}%`;
}

function showMessage(text, type = "") {
  messageBox.textContent = text;
  messageBox.className = `message-box ${type}`.trim();
  messageBox.hidden = !text;
}

function toCompactDate(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function escapeICS(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}

function safeFilename(value) {
  return value.trim().replace(/[\\/:*?"<>|]/g, "-").slice(0, 60) || "日程";
}
