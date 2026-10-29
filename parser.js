const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const EVENT_WORDS = "开营仪式|仪式|会议|活动|讲座|培训|比赛|考试|课程|典礼|班会|宣讲会|见面会";

export function parseISODate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) {
    return null;
  }
  return date;
}

export function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatLongDate(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（${WEEKDAYS[date.getDay()]}）`;
}

export function parseSchedule(text, screenshotISODate) {
  const screenshotDate = parseISODate(screenshotISODate);
  if (!screenshotDate) throw new Error("请选择有效的截图日期。");

  const cleaned = String(text ?? "")
    .replace(/[０-９]/g, (character) => String(character.charCodeAt(0) - 0xfee0))
    .replace(/\r\n?/g, "\n")
    .trim();

  if (!cleaned) throw new Error("还没有可分析的聊天文字。");

  const timestampPattern = /(大前天|前天|昨天|今天)\s*(?:[0-2]?\d\s*[:：]\s*[0-5]\d|[0-2]?\d\s*点(?:\s*(?:半|[0-5]?\d)\s*分?)?)/;
  const timestamp = timestampPattern.exec(cleaned);

  let messageDate = dateAtNoon(screenshotDate);
  const cautions = [];
  let timestampDescription;
  if (timestamp) {
    messageDate = addDays(messageDate, relativeDayOffset(timestamp[1]));
    timestampDescription = `图中写的是“${timestamp[0].trim()}”`;
  } else {
    timestampDescription = "截图上没有消息日期标签，先按截图日期计算";
    cautions.push("未找到“昨天/今天”等消息日期标签，消息日期暂按截图日期处理。");
  }

  const eventSearchText = cleaned.replace(new RegExp(timestampPattern.source, "g"), "\n");
  const resolved = resolveEventDate(eventSearchText, messageDate);
  if (!resolved) {
    throw new Error("找到了文字，但没有找到能推出具体日期的表达。请检查识别文本中的“下周四”等日期。");
  }

  const time = resolveTime(eventSearchText, resolved.index, resolved.phrase.length);
  const eventDate = dateAtNoon(resolved.date);
  if (time) eventDate.setHours(time.hour, time.minute, 0, 0);

  const title = extractTitle(cleaned);
  const location = extractLocation(eventSearchText, resolved.index + resolved.phrase.length);
  const steps = [
    `截图日期：${formatLongDate(screenshotDate)}`,
    `${timestampDescription}，所以消息日期：${formatLongDate(messageDate)}`,
    `图中的“${resolved.phrase}”按消息所在自然周推理，得到：${formatLongDate(eventDate)}`
  ];

  if (time) {
    steps.push(`消息还提供了“${time.phrase}”，具体时刻为 ${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`);
  } else {
    cautions.push("原消息只确定了日期，没有给出具体时刻，因此会保存为全天日程。");
  }
  if (cleaned.includes("暂定")) cautions.push("原消息使用的是“暂定”，仍要留意是否改期。");
  if (title === "截图识别日程") cautions.push("没有自动提取到可靠标题，请修改后再下载日历。");

  return {
    title,
    location,
    eventDateISO: toISODate(eventDate),
    eventDateLabel: formatLongDate(eventDate),
    hasExplicitTime: Boolean(time),
    hour: time?.hour ?? 9,
    minute: time?.minute ?? 0,
    messageDateISO: toISODate(messageDate),
    messageDateLabel: formatLongDate(messageDate),
    screenshotDateLabel: formatLongDate(screenshotDate),
    datePhrase: resolved.phrase,
    steps,
    caution: cautions.length ? cautions.join(" ") : null,
    rawText: cleaned
  };
}

function resolveEventDate(text, messageDate) {
  const explicit = /(?:(20\d{2})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/.exec(text);
  if (explicit) {
    let year = explicit[1] ? Number(explicit[1]) : messageDate.getFullYear();
    const month = Number(explicit[2]);
    const day = Number(explicit[3]);
    let date = validDate(year, month, day);
    if (date && !explicit[1] && date.getTime() < addDays(messageDate, -180).getTime()) {
      year += 1;
      date = validDate(year, month, day);
    }
    if (date) return { date, phrase: explicit[0], index: explicit.index };
  }

  const weekday = /(下下|下|本|这)?\s*(?:周|星期|礼拜)\s*(一|二|三|四|五|六|日|天|[1-7])/.exec(text);
  if (weekday) {
    const target = weekdayNumber(weekday[2]);
    const date = weekdayDate(weekday[1] ?? "", target, messageDate);
    return { date, phrase: weekday[0], index: weekday.index };
  }

  const relative = /(大后天|后天|明天|今天|昨天|前天)/.exec(text);
  if (relative) {
    return {
      date: addDays(messageDate, relativeDayOffset(relative[1])),
      phrase: relative[1],
      index: relative.index
    };
  }

  return null;
}

function resolveTime(text, dateIndex, dateLength) {
  const start = Math.max(0, dateIndex - 80);
  const context = text.slice(start, dateIndex + dateLength + 140);
  const hourPattern = /(上午|早上|凌晨|中午|下午|傍晚|晚上)?\s*([0-2]?\d|[零一二两三四五六七八九十]{1,3})\s*点(?:\s*(半|一刻|[0-5]?\d|[零一二三四五六七八九十]{1,3})\s*分?)?/.exec(context);
  if (hourPattern) {
    let hour = adjustedHour(parseClockNumber(hourPattern[2]), hourPattern[1] ?? "");
    const minute = hourPattern[3] === "半"
      ? 30
      : hourPattern[3] === "一刻"
        ? 15
        : parseClockNumber(hourPattern[3] ?? 0);
    if (hourPattern[1] === "凌晨" && hour === 12) hour = 0;
    return { hour, minute, phrase: hourPattern[0].trim() };
  }

  const periodColon = /(上午|早上|凌晨|中午|下午|傍晚|晚上)\s*([0-2]?\d)\s*[:：]\s*([0-5]\d)/.exec(context);
  if (periodColon) {
    return {
      hour: adjustedHour(Number(periodColon[2]), periodColon[1]),
      minute: Number(periodColon[3]),
      phrase: periodColon[0].trim()
    };
  }

  const colon = /(?<!\d)([0-2]?\d)\s*[:：]\s*([0-5]\d)(?!\d)/.exec(context);
  if (colon) {
    return { hour: Number(colon[1]), minute: Number(colon[2]), phrase: colon[0].trim() };
  }
  return null;
}

function extractTitle(text) {
  const singleLine = text.replace(/\n/g, "");
  const participating = new RegExp(`(?:参加|参与|出席)\\s*([^，。；：]{2,36}?(?:${EVENT_WORDS}))`).exec(singleLine);
  if (participating) {
    const title = trimTitle(participating[1]);
    if (title) return title;
  }

  const fallback = new RegExp(`([^，。；：\\n]{2,28}(?:${EVENT_WORDS}))`).exec(singleLine);
  if (fallback) {
    let title = trimTitle(fallback[1]);
    for (const prefix of ["需要大家", "请大家", "要求大家", "受团课学习要求"]) {
      title = title.replace(prefix, "");
    }
    if (title) return title;
  }
  return "截图识别日程";
}

function extractLocation(text, startIndex) {
  const explicit = /(?:地点|地址)\s*[:：]\s*([^，。；\n（(]{2,24})/.exec(text);
  if (explicit) return explicit[1].trim();

  const suffix = text.slice(startIndex, startIndex + 90).replace(/\n/g, "");
  const location = /(?:在|于)\s*([^，。；\n（(]{2,20}?)(?=\s*(?:举行|进行|举办|开展|集合|开会|参加|出席|[，。；）)]|$))/.exec(suffix);
  return location?.[1]?.trim() || null;
}

function weekdayDate(qualifier, targetWeekday, messageDate) {
  const messageDay = dateAtNoon(messageDate);
  const daysSinceMonday = (messageDay.getDay() + 6) % 7;
  const monday = addDays(messageDay, -daysSinceMonday);
  const weekOffset = qualifier === "下" ? 1 : qualifier === "下下" ? 2 : 0;
  let result = addDays(monday, weekOffset * 7 + targetWeekday - 1);
  if (!qualifier && result.getTime() < messageDay.getTime()) result = addDays(result, 7);
  return result;
}

function weekdayNumber(value) {
  if (value === "一" || value === "1") return 1;
  if (value === "二" || value === "2") return 2;
  if (value === "三" || value === "3") return 3;
  if (value === "四" || value === "4") return 4;
  if (value === "五" || value === "5") return 5;
  if (value === "六" || value === "6") return 6;
  return 7;
}

function relativeDayOffset(value) {
  return {
    大前天: -3,
    前天: -2,
    昨天: -1,
    今天: 0,
    明天: 1,
    后天: 2,
    大后天: 3
  }[value] ?? 0;
}

function adjustedHour(hour, period) {
  if (["下午", "傍晚", "晚上"].includes(period)) return hour < 12 ? hour + 12 : hour;
  if (period === "中午") return hour < 11 ? hour + 12 : hour;
  return hour;
}

function parseClockNumber(value) {
  if (/^\d+$/.test(String(value))) return Number(value);
  const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const text = String(value).trim();
  if (!text) return 0;
  if (text.includes("十")) {
    const [tensPart, onesPart] = text.split("十");
    const tens = tensPart ? digits[tensPart] ?? 0 : 1;
    const ones = onesPart ? digits[onesPart] ?? 0 : 0;
    return tens * 10 + ones;
  }
  return digits[text] ?? 0;
}

function validDate(year, month, day) {
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function dateAtNoon(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12);
}

function trimTitle(value) {
  return value.trim().replace(/^[：:，,。；;“”「」]+|[：:，,。；;“”「」]+$/g, "");
}
