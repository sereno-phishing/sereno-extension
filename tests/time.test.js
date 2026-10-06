"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const { time } = load("time/domain/time.js");

test("stamps and ISO days use local time with zero padding", () => {
  const date = new Date(2026, 8, 5, 7, 4, 59);
  assert.equal(time.stamp(date), "2026-09-05T07:04");
  assert.equal(time.isoDay(date), "2026-09-05");
  assert.equal(time.pad2(9), "09");
  assert.equal(time.pad2(12), "12");
});

test("display formats", () => {
  assert.equal(time.formatDateTime("2026-09-21T10:14"), "21/09/2026 10:14");
  assert.equal(time.formatDate("2026-09-21T10:14"), "21/09/2026");
  assert.equal(time.formatDateTime("not a date"), "not a date");
  assert.equal(time.formatDateTime(undefined), "");
  assert.equal(time.formatDay("2026-09-22"), "22/09/2026");
  assert.equal(time.formatAnyDay("21/09/2026"), "21/09/2026");
  assert.equal(time.formatAnyDay("2026-09-18"), "18/09/2026");
});
