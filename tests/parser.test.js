import test from "node:test";
import assert from "node:assert/strict";
import { parseSchedule } from "../parser.js";

test("resolves yesterday as the message date and next Thursday from the following week", () => {
  const result = parseSchedule(`
各位同学中午好：
受团课学习要求，需要大家参加
征信计划的开营仪式（大一同学完整
参与征信计划）作为团课学习一部
分，暂定于下周四在南望山大活进
行。
昨天 11:56
`, "2026-10-29");

  assert.equal(result.messageDateISO, "2026-10-28");
  assert.equal(result.eventDateISO, "2026-11-05");
  assert.equal(result.hasExplicitTime, false);
  assert.equal(result.title, "征信计划的开营仪式");
  assert.equal(result.location, "南望山大活");
  assert.match(result.caution, /全天/);
});

test("extracts an explicit event time and does not confuse a later timestamp with it", () => {
  const result = parseSchedule(`
本周四下午三点在图书馆三楼参加
新生讲座
昨天 13:10
`, "2026-10-29");

  assert.equal(result.eventDateISO, "2026-10-29");
  assert.equal(result.hasExplicitTime, true);
  assert.equal(result.hour, 15);
  assert.equal(result.location, "图书馆三楼");
  assert.equal(result.title, "新生讲座");
});

test("supports explicit month and day", () => {
  const result = parseSchedule("暂定于11月12日晚上7点半举行班会，地点：教学楼A101。昨天 09:28", "2026-10-29");
  assert.equal(result.eventDateISO, "2026-11-12");
  assert.equal(result.hour, 19);
  assert.equal(result.minute, 30);
  assert.equal(result.location, "教学楼A101");
});

test("rejects text without an event date", () => {
  assert.throws(
    () => parseSchedule("请大家尽快完成材料。昨天 10:00", "2026-10-29"),
    /没有找到/
  );
});
