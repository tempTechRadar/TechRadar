// 알림·대시보드·기록 화면이 같이 쓰는 거르기 선택칸(주소의 ?이름=값으로 보내는 일반 폼, 자바스크립트 없이 동작).
export function FilterSelect({ label, name, value, options }: { label: string; name: string; value?: string; options: [string, string][] }) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value ?? ""}>
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </label>
  );
}

export const PERIOD_OPTIONS: [string, string][] = [["", "전체"], ["7d", "최근 7일"], ["30d", "최근 30일"]];
export const KIND_OPTIONS: [string, string][] = [["", "전체"], ["security", "보안 경고"], ["opportunity", "적용 기회"], ["model_eol", "모델 종료"]];
