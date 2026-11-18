// 흐름 화면·내 실행 기록이 읽는 runs·run_steps 칸(두 화면이 같은 값을 보게 한 곳에 둔다)
export const RUN_COLUMNS = "id, trigger, status, created_at, started_at, finished_at, item_count";
export const STEP_COLUMNS =
  "step_name, status, input_summary, output_summary, api_url, http_status, duration_ms, count_in, count_out, branch_counts, error_kind, error_message";
