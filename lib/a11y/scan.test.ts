import { test } from "node:test";
import assert from "node:assert/strict";
import { formControlProblems, interactiveProblems } from "./scan.ts";

test("label로 감싼 칸·htmlFor로 이은 칸·aria-label 칸·hidden 칸은 문제 없음", () => {
  const src = `<label>사유 <input name="r" /></label><label htmlFor="q">질문</label><textarea id="q" /><select aria-label="갈래" /><input type="hidden" name="id" />`;
  assert.deepEqual(formControlProblems(src), []);
});

test("이름 없는 칸을 잡는다", () => {
  assert.deepEqual(formControlProblems(`<div><input name="value" /></div><select name="k"></select>`), ["이름 없는 input(name=value)", "이름 없는 select(name=k)"]);
});

test("htmlFor가 다른 id를 가리키면 이름 없음", () => {
  assert.deepEqual(formControlProblems(`<label htmlFor="a">A</label><input id="b" name="b" />`), ["이름 없는 input(name=b)"]);
});

test("div onClick, alt 없는 img, 링크를 품은 role=img SVG, outline 없앰을 잡는다", () => {
  const src = `<div onClick={go}>x</div><img src="a.png" /><svg role="img" aria-label="g"><a href="/x">n</a></svg><p style={{ outline: "none" }} />`;
  assert.deepEqual(interactiveProblems(src), ["div에 onClick", "alt 없는 img", "링크를 품은 SVG가 role=img(안의 링크가 읽히지 않음)", "outline 없앰"]);
});

test("button onClick·alt 있는 img·aria-hidden svg는 문제 없음", () => {
  assert.deepEqual(interactiveProblems(`<button onClick={go}>x</button><img src="a" alt="" /><svg aria-hidden="true"></svg>`), []);
});

test("outline을 지워도 같은 곳에 :focus-visible 모양을 주면 괜찮다", () => {
  assert.deepEqual(interactiveProblems(`const CSS = "a:focus { outline: none; } a:focus-visible > rect { stroke: blue; }";`), []);
});
