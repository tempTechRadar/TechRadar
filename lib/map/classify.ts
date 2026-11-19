// 갈래(하는 일) 자동 분류(PRD-F24 "규칙 먼저, 애매하면 관리자"). 순수 함수: 이름·한 줄 설명·기술 키의 낱말을 세부 갈래의 낱말과 맞춰 본다.
// 갈래 목록과 낱말은 DB(categories.keywords)에 있고 관리자가 고칠 수 있다. 처음 목록은 CATEGORY_SEED(마이그레이션이 이것을 넣는다).
// 처음 목록은 사용자의 추천 8개를 기본으로, 운영 카탈로그 표본(11-19, 5,565개 중 200개 + 낱말 빈도 150개)을 보고 Claude가 2개를 더하고 세부 갈래를 만들었다.

export type SeedSmall = { name: string; keywords: string[] };
export type SeedBig = { name: string; smalls: SeedSmall[] };

export const CATEGORY_SEED: SeedBig[] = [
  { name: "리서치", smalls: [
    { name: "웹 검색·수집", keywords: ["web search", "search engine", "serp", "crawl", "crawler", "scrape", "scraping", "scraper", "firecrawl", "browse the web"] },
    { name: "논문·지식", keywords: ["paper", "papers", "arxiv", "scholar", "academic", "wikipedia", "citation"] },
    { name: "뉴스·트렌드", keywords: ["news", "trends", "trend", "rss", "headlines"] },
  ] },
  { name: "기획·문서", smalls: [
    { name: "문서·노트", keywords: ["docs", "document", "documents", "notes", "notebook", "notion", "markdown", "wiki", "confluence", "pdf", "write", "writing", "draft"] },
    { name: "작업·일정", keywords: ["task", "tasks", "todo", "project management", "jira", "linear", "asana", "trello", "calendar", "schedule", "planner", "pmo"] },
    { name: "회의·협업", keywords: ["meeting", "meetings", "workspace", "collaborate", "collaboration", "teams", "transcripts", "minutes"] },
  ] },
  { name: "디자인", smalls: [
    { name: "디자인 도구", keywords: ["figma", "design", "canva", "ui kit", "mockup", "brand visuals"] },
    { name: "이미지·영상 생성", keywords: ["generate images", "image generation", "images", "image", "video", "videos", "photo", "photos", "sprite", "pixel art", "voiceover", "dubbing"] },
    { name: "3D·CAD", keywords: ["3d", "cad", "pcb", "kicad", "render", "stl", "scene"] },
  ] },
  { name: "프론트엔드", smalls: [
    { name: "브라우저 자동화", keywords: ["browser", "playwright", "puppeteer", "selenium", "screenshot", "screenshots", "headless"] },
    { name: "화면·컴포넌트", keywords: ["frontend", "react", "component", "components", "css", "tailwind", "ui", "web page", "html pages", "widget"] },
  ] },
  { name: "백엔드·데이터", smalls: [
    { name: "데이터베이스", keywords: ["database", "sql", "postgres", "postgresql", "mysql", "sqlite", "mongodb", "redis", "supabase", "elasticsearch", "query"] },
    { name: "API·웹훅", keywords: ["graphql", "webhook", "webhooks", "endpoint", "openapi"] },
    { name: "데이터 분석", keywords: ["analytics", "analyst", "dataset", "statistics", "statistical", "spreadsheet", "excel", "csv", "bigquery", "warehouse", "metrics", "dashboard", "dashboards"] },
    { name: "파일·저장소", keywords: ["file", "files", "storage", "s3", "drive", "upload", "convert", "compress"] },
  ] },
  { name: "검사·보안", smalls: [
    { name: "코드 검사·테스트", keywords: ["code review", "lint", "test", "tests", "testing", "qa"] },
    { name: "보안·감사", keywords: ["security", "vulnerability", "vulnerabilities", "cve", "audit", "scan", "secret", "secrets", "spoofing", "dmarc", "compliance", "risk"] },
    { name: "검증·서명", keywords: ["verify", "verified", "verification", "proof", "proofs", "signed", "attested", "notary", "cryptographic"] },
  ] },
  { name: "배포·운영", smalls: [
    { name: "배포·클라우드", keywords: ["deploy", "deployment", "vercel", "netlify", "aws", "azure", "gcp", "cloudflare", "kubernetes", "docker", "container", "containers", "terraform"] },
    { name: "서버·인프라", keywords: ["server management", "ssh", "vps", "gpu", "compute", "infrastructure", "dns", "domain", "domains", "stack generator"] },
    { name: "모니터링·로그", keywords: ["monitoring", "monitor", "logs", "observability", "sentry", "datadog", "grafana", "incident", "uptime"] },
    { name: "git·이슈", keywords: ["github", "gitlab", "git", "pull request", "issues", "repository", "repos", "commit"] },
  ] },
  { name: "AI 작업 방식", smalls: [
    { name: "메모리·컨텍스트", keywords: ["memory", "memories", "rag", "embedding", "embeddings", "vector", "knowledge base", "knowledge graph"] },
    { name: "에이전트·오케스트레이션", keywords: ["multi-agent", "orchestration", "prompt", "prompts", "llm", "subagent", "skill", "skills", "a2a"] },
    { name: "사람 확인", keywords: ["human-in-the-loop", "approval", "approvals", "approve", "mandate", "permit", "escalate", "review page"] },
  ] },
  { name: "업무·서비스 연동", smalls: [
    { name: "결제·금융", keywords: ["payment", "payments", "pay", "invoice", "invoices", "stripe", "crypto", "wallet", "usdc", "x402", "bank", "banking", "finance", "stock", "trading", "accounting", "books", "checkout", "mortgage"] },
    { name: "마케팅·소셜", keywords: ["seo", "ads", "marketing", "social", "instagram", "tiktok", "twitter", "linkedin", "facebook", "brand", "influencer", "posts", "campaigns", "outreach"] },
    { name: "커뮤니케이션", keywords: ["email", "emails", "inbox", "slack", "discord", "chat", "sms", "whatsapp", "telegram", "call", "calls", "phone"] },
    { name: "미디어·콘텐츠", keywords: ["youtube", "audio", "podcast", "music", "voice", "radio", "film", "films", "captions", "transcription"] },
    { name: "커머스·영업", keywords: ["shop", "shopify", "ecommerce", "amazon", "seller", "crm", "sales", "prospects", "leads", "catalog", "orders"] },
  ] },
  { name: "생활·정보", smalls: [
    { name: "여행·장소", keywords: ["travel", "hotel", "hotels", "flight", "flights", "booking", "restaurants", "places", "weather", "maps", "beach"] },
    { name: "건강·운동", keywords: ["health", "medical", "medicine", "calorie", "calories", "fitness", "workout", "gym", "meditation", "food"] },
    { name: "법·세금·공공 데이터", keywords: ["legal", "law", "case law", "legislation", "regulations", "tax", "patent", "government", "public data", "census", "official sources"] },
  ] },
];

export type ClassifyCategory = { id: string; parentId: string; keywords: string[] | null };
export type ClassifyResult = { categoryId: string | null; score: number; runnerUp: number };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// 낱말 경계로 맞춘다("pay"가 "paypal"·"display"에 걸리지 않게). 매일 수천 개를 보므로 낱말마다 한 번만 만든다
const matchers = new Map<string, RegExp>();
const matcher = (kw: string) => {
  let m = matchers.get(kw);
  if (!m) matchers.set(kw, (m = new RegExp(`(^|[^a-z0-9])${escape(kw.toLowerCase())}($|[^a-z0-9])`)));
  return m;
};

/** 세부 갈래마다 맞은 낱말 수(이름에서 맞으면 2점, 한 줄 설명에서 맞으면 1점, 두 낱말 이상 구절은 두 배)를 센다. 기술 키는 보지 않는다(app.netlify.… 같은 주소가 "배포"로 잘못 걸림).
 *  혼자 가장 높을 때만 그 세부 갈래. 비기거나 아무것도 안 맞으면 비워 둔다 → 관리자 분류 확인(IA-17)이 "갈래 없는 기술"로 보여 준다.
 *  (같은 큰 갈래 안에서 비길 때 큰 갈래를 저장하면 그 기술이 관리자 목록·다음 분류에서 빠져 세부 갈래를 영영 못 받는다) */
export function classify(name: string, oneLiner: string | null, smalls: ClassifyCategory[]): ClassifyResult {
  const head = name.toLowerCase(), body = (oneLiner ?? "").toLowerCase();
  const scores = smalls.map((c) => {
    let s = 0;
    for (const kw of c.keywords ?? []) { const m = matcher(kw), w = kw.includes(" ") || kw.includes("-") ? 2 : 1; if (m.test(head)) s += 2 * w; else if (m.test(body)) s += w; } // 두 낱말 이상 구절(code review)은 뜻이 분명해 두 배
    return { c, s };
  }).sort((a, b) => b.s - a.s || (a.c.id < b.c.id ? -1 : 1));
  const best = scores[0]?.s ?? 0, runnerUp = scores[1]?.s ?? 0;
  return { categoryId: best > 0 && best > runnerUp ? scores[0].c.id : null, score: best, runnerUp };
}
