export type DiffOp = { type: 'equal' | 'added' | 'removed'; text: string };

// eco: 단어 단위 LCS diff. 문자 단위/대용량이 필요해지면 라이브러리로 교체.
// old(이전 버전) → new(현재) 비교: new에만 있으면 added, old에만 있으면 removed.
export function diffWords(oldText: string, newText: string): DiffOp[] {
  const a = oldText.split(/\s+/).filter(Boolean);
  const b = newText.split(/\s+/).filter(Boolean);
  const m = a.length;
  const n = b.length;

  // LCS 길이 DP
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      ops.push({ type: 'equal', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'removed', text: a[i] });
      i++;
    } else {
      ops.push({ type: 'added', text: b[j] });
      j++;
    }
  }
  while (i < m) ops.push({ type: 'removed', text: a[i++] });
  while (j < n) ops.push({ type: 'added', text: b[j++] });
  return ops;
}
