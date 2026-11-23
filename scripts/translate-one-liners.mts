// 기술 한 줄 설명 한국어 번역 한 번 돌리기(P-12r). 서버 키는 .env.local에서만 읽는다(출력에 키 · 주소를 찍지 않는다).
//
//   미리 보기(기본, DB에 아무것도 쓰지 않음): 번역할 줄 몇 개를 골라 Claude를 1번 불러 결과만 출력한다
//     node --env-file=.env.local scripts/translate-one-liners.mts [--limit 5]
//   운영에 쓰기(지도 몫 공개 목록 전부, 번역이 없는 줄만 · 마이그레이션 202611240300 적용 뒤): Maestro가 사용자 승인을 받은 뒤에만
//     node --env-file=.env.local scripts/translate-one-liners.mts --write [--limit N]
//
// 미리 보기는 새 칸(one_liner_ko …)이 아직 없어도 돈다(옛 칸만 읽는다). --write는 새 칸이 있어야 한다.
import { createClient } from "@supabase/supabase-js";
import { createAnthropicClient } from "../lib/server/anthropic-client.ts";
import { translateOneLiners, translateRows, type Row, type TranslateResult } from "../lib/server/translate-one-liners.ts";

const args = process.argv.slice(2);
const write = args.includes("--write");
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : write ? undefined : 5;
if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new Error("--limit은 1 이상의 정수");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error(".env.local에 NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY가 필요해요");
const ai = createAnthropicClient(process.env);
if (!ai) throw new Error("ANTHROPIC_API_KEY가 없거나 모양이 이상해요(.env.local 확인, 값은 출력하지 않아요)");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

/** 미리 보기용: 새 칸 없이 공개 목록에서 서로 다른 자리의 줄 n개(별 많은 순 40개 중 고르게) */
async function previewRows(n: number): Promise<Row[]> {
  const { data, error } = await db.from("technologies").select("id, display_name, one_liner").neq("status", "gone").eq("is_simulated", false).not("one_liner_source", "is", null).not("one_liner", "is", null)
    .order("signals->stars", { ascending: false, nullsFirst: false }).limit(200);
  if (error) throw new Error(`읽지 못함: ${error.message}`);
  const pool = (data ?? []).filter((r) => typeof r.one_liner === "string" && r.one_liner.trim().length > 0);
  const step = Math.max(1, Math.floor(pool.length / n));
  return Array.from({ length: Math.min(n, pool.length) }, (_, i) => pool[i * step]).map((r) => ({ id: r.id, display_name: r.display_name, one_liner: r.one_liner, one_liner_ko: null, one_liner_ko_src: null }));
}

const result: TranslateResult = write ? await translateOneLiners({ db, ai, limit }) : await translateRows({ db, ai, dryRun: true }, await previewRows(limit!));
const { samples, errors, ...counts } = result;
console.log(write ? "쓰기 실행 결과" : "미리 보기(DB에 쓰지 않음)", JSON.stringify(counts));
for (const s of samples) console.log(`\n[${s.name}]\n  EN: ${s.en}\n  KO: ${s.ko}`);
if (errors.length) console.log("\n오류:", errors.join(" / "));
if (result.failedBatches > 0 || result.saveFailed > 0) process.exitCode = 1;
