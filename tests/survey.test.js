"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const { survey } = load("survey/domain/sus.js");

test("the questionnaire has the ten SUS items and a 1-5 scale", () => {
  assert.equal(survey.QUESTIONS.length, 10);
  assert.deepEqual(survey.SCALE, [1, 2, 3, 4, 5]);
});

test("best and worst possible answers score 100 and 0", () => {
  assert.deepEqual(survey.score([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]), { score: 100, band: "Excelente", bandId: "excelente" });
  assert.deepEqual(survey.score([1, 5, 1, 5, 1, 5, 1, 5, 1, 5]), { score: 0, band: "A mejorar", bandId: "mejorar" });
});

test("score bands use 85, 70 and 50 as lower bounds", () => {
  assert.deepEqual(survey.score([4, 2, 5, 1, 4, 2, 5, 1, 3, 2]), { score: 83, band: "Bueno", bandId: "bueno" });
  assert.deepEqual(survey.score([3, 3, 3, 3, 3, 3, 3, 3, 3, 3]), { score: 50, band: "Aceptable", bandId: "aceptable" });
  assert.equal(survey.score([4, 2, 4, 2, 4, 2, 4, 2, 4, 2]).score, 75);
  assert.equal(survey.score([5, 1, 5, 1, 5, 1, 4, 2, 4, 2]).band, "Excelente");
  assert.equal(survey.score([2, 4, 2, 4, 2, 4, 2, 4, 2, 4]).band, "A mejorar");
});

test("unanswered items count as zero contribution", () => {
  assert.equal(survey.score([]).score, 50);
});

test("draftAnswers keeps one slot per question", () => {
  assert.deepEqual(survey.draftAnswers([3, 5]), [3, 5, null, null, null, null, null, null, null, null]);
  assert.equal(survey.draftAnswers(undefined).length, 10);
  assert.equal(survey.isLastQuestion(8), false);
  assert.equal(survey.isLastQuestion(9), true);
});
