// MCP 서버의 url → 기술 키(SPEC-7.3). 원격(공개 호스트의 http·https) 주소만 url:호스트가 되고,
// 내 컴퓨터·사설 주소·호스트가 없는 주소는 키를 만들지 않는다("찾지 못함·서버 별명만", 불변 2). 공용 카탈로그·지도에 쓸모없는 점이 안 올라가게.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPrivateHost, mcpServerKey } from "./tech-key.ts";

const key = (url: string) => mcpServerKey({ url })?.key ?? null;

test("공개 호스트의 http·https 주소는 url:호스트다(포트가 있으면 포트까지, 소문자로, 사용자·비밀번호는 빼고)", () => {
  assert.equal(key("https://mcp.vercel.com/sse"), "url:mcp.vercel.com");
  assert.equal(key("http://docs-mcp.getzep.com/mcp"), "url:docs-mcp.getzep.com");
  assert.equal(key("https://mcp.example.com:8443/x"), "url:mcp.example.com:8443");
  assert.equal(key("HTTPS://MCP.Example.COM/Path"), "url:mcp.example.com");
  const withUser = key("https://user:secret-pass@mcp.example.com/sse");
  assert.equal(withUser, "url:mcp.example.com");
  assert.ok(!String(withUser).includes("secret"), "비밀번호가 키에 들어가지 않는다");
});

test("공개 IP 주소도 원격이다: IPv4와 IPv6", () => {
  assert.equal(key("https://8.8.8.8/x"), "url:8.8.8.8");
  assert.equal(key("https://[2606:4700:4700::1111]/x"), "url:[2606:4700:4700::1111]");
});

test("내 컴퓨터 주소는 키를 만들지 않는다: localhost 변형·루프백(10진·16진·줄임 표기 포함)", () => {
  for (const url of [
    "http://localhost:3333/mcp", "http://LOCALHOST/", "http://localhost./", "http://app.localhost:8080/", "http://a.b.localhost/",
    "http://127.0.0.1:6061/sse", "http://127.1/", "http://2130706433/", "http://0x7f000001/", "http://127.255.255.254/",
    "http://0.0.0.0:8080/", "http://[::1]:3000/", "http://[::]/", "http://[::ffff:127.0.0.1]/",
  ]) assert.equal(key(url), null, url);
});

test("사설·링크로컬·공유 주소 대역은 키를 만들지 않는다(IPv4 10/8·172.16/12·192.168/16·169.254/16·100.64/10, IPv6 fc00::/7·fe80::/10·멀티캐스트, IPv4 매핑)", () => {
  for (const url of [
    "http://10.0.0.5/", "http://10.255.255.255/", "http://172.16.0.1/", "http://172.31.255.255/", "http://192.168.1.10:8000/", "http://169.254.169.254/latest",
    "http://100.64.0.1/", "http://100.127.255.255/", "http://224.0.0.1/", "http://255.255.255.255/",
    "http://[fd00::1]/", "http://[fc00::1]/", "http://[fe80::1]/", "http://[febf::1]/", "http://[ff02::1]/", "http://[::ffff:10.0.0.1]/", "http://[::ffff:192.168.0.1]/",
  ]) assert.equal(key(url), null, url);
});

test("사설 대역 바로 옆의 공개 주소는 키가 된다(경계가 한 칸씩 어긋나지 않았다)", () => {
  for (const [url, want] of [
    ["http://172.15.255.255/", "url:172.15.255.255"], ["http://172.32.0.1/", "url:172.32.0.1"], ["http://100.63.255.255/", "url:100.63.255.255"],
    ["http://100.128.0.1/", "url:100.128.0.1"], ["http://192.167.0.1/", "url:192.167.0.1"], ["http://192.169.0.1/", "url:192.169.0.1"],
    ["http://11.0.0.1/", "url:11.0.0.1"], ["http://9.255.255.255/", "url:9.255.255.255"], ["http://169.253.0.1/", "url:169.253.0.1"], ["http://126.0.0.1/", "url:126.0.0.1"],
    ["http://223.255.255.255/", "url:223.255.255.255"],
  ] as const) assert.equal(key(url), want, url);
});

test("점이 없는 이름과 안쪽 이름(.local·.internal·.lan·.home·.corp·.intranet·.private·.home.arpa)은 키를 만들지 않는다", () => {
  for (const url of [
    "http://mcp-server:8080/", "http://db/", "http://host.docker.internal:3000/", "http://nas.local/", "http://box.lan/", "http://pc.home/",
    "http://svc.corp/", "http://wiki.intranet/", "http://x.private/", "http://router.home.arpa/", "http://a.b.c.internal/",
  ]) assert.equal(key(url), null, url);
});

test("이름 끝맺음은 점 단위로만 본다: localhostx.com·example.local.com·internal.example.com·mylan.com은 공개 주소다", () => {
  for (const [url, want] of [
    ["http://localhostx.com/", "url:localhostx.com"], ["http://notlocalhost.example.com/", "url:notlocalhost.example.com"], ["http://example.local.com/", "url:example.local.com"],
    ["http://internal.example.com/", "url:internal.example.com"], ["http://mylan.com/", "url:mylan.com"], ["http://corp.example.org/", "url:corp.example.org"],
    ["http://homearpa.example.com/", "url:homearpa.example.com"],
    // 글자만 같게 끝나고 점 경계가 없는 이름(.local이 아니라 notlocal)
    ["http://a.notlocal/", "url:a.notlocal"], ["http://api.biglan/", "url:api.biglan"], ["http://b.myinternal/", "url:b.myinternal"],
    ["http://c.xhome/", "url:c.xhome"], ["http://d.mycorp/", "url:d.mycorp"], ["http://example.milan/", "url:example.milan"],
  ] as const) assert.equal(key(url), want, url);
});

test("IPv4 매핑 IPv6는 안의 IPv4 앞 칸으로 판단한다: 매핑된 공개 주소는 키가 되고, 매핑된 사설 주소는 키가 없다(앞 칸과 뒤 칸이 서로 다른 성격인 주소로)", () => {
  assert.equal(key("http://[::ffff:8.8.0.1]/"), "url:[::ffff:808:1]", "앞 칸 8.8은 공개, 뒤 칸 0.1만 보면 사설처럼 보인다");
  assert.equal(key("http://[::ffff:10.1.2.3]/"), null, "앞 칸 10.1은 사설, 뒤 칸 2.3만 보면 공개처럼 보인다");
  assert.equal(key("http://[::ffff:172.16.9.9]/"), null);
  assert.equal(key("http://[::ffff:172.32.9.9]/"), "url:[::ffff:ac20:909]");
});

test("http·https가 아니거나 호스트가 없는 주소는 키를 만들지 않는다(빈 키 url:이 생기지 않는다)", () => {
  for (const url of ["javascript:alert(1)", "file:///etc/passwd", "ftp://example.com/x", "ws://example.com/", "data:text/plain,x", "mailto:a@example.com", "not a url", "https://", "//example.com/x"]) {
    assert.equal(key(url), null, url);
  }
});

test("isPrivateHost: 끝 점과 대소문자를 맞춘 뒤 판단하고, 빈 값은 공개가 아니다", () => {
  assert.equal(isPrivateHost(""), true);
  assert.equal(isPrivateHost("LocalHost."), true);
  assert.equal(isPrivateHost("NAS.LOCAL"), true, "대문자 이름 끝맺음");
  assert.equal(isPrivateHost("NAS.LOCAL."), true, "대문자에 끝 점");
  assert.equal(isPrivateHost("[FD00::1]"), true, "대문자 IPv6");
  assert.equal(isPrivateHost("EXAMPLE.LOCAL.COM"), false);
  assert.equal(isPrivateHost("EXAMPLE.COM."), false);
  assert.equal(isPrivateHost("example.com"), false);
  assert.equal(isPrivateHost("[::1]"), true);
  assert.equal(isPrivateHost("[2606:4700:4700::1111]"), false);
});

test("url이 아닌 서버(npx·uvx·pipx)는 그대로이고, url이 안쪽 주소면 command가 있어도 키를 만들지 않는다(url이 우선)", () => {
  assert.equal(mcpServerKey({ command: "npx", args: ["-y", "mcp-remote@0.1.15"] })?.key, "npm:mcp-remote");
  assert.equal(mcpServerKey({ command: "uvx", args: ["mcp-server-fetch"] })?.key, "pypi:mcp-server-fetch");
  assert.equal(mcpServerKey({ command: "node", args: ["x.js"] }), null);
  assert.equal(mcpServerKey({ url: "http://localhost:3000/mcp", command: "npx", args: ["-y", "some-pkg"] }), null);
});
