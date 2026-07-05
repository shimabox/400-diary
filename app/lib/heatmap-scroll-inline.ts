/**
 * calendar-view のヒートマップ横スクロールを hydration 前に確定させる
 * インラインスクリプト。クライアントバンドル実行を待つとちらつくため、
 * これだけは HTML パース時に実行されるインラインスクリプトのまま残し、
 * CSP は 'unsafe-inline' ではなく SHA-256 ハッシュでこのスクリプトのみを許可する。
 *
 * 文字列を1文字でも変更するとハッシュが一致せず CSP にブロックされるため、
 * スクリプト本体とハッシュは必ずこのファイルで一緒に管理し、両者の整合は
 * heatmap-scroll-inline.test.ts が検証する（変更時はテストが新しいハッシュを教えてくれる）。
 */
export const HEATMAP_SCROLL_INLINE_SCRIPT = `(()=>{const s=document.currentScript;const el=s&&s.previousElementSibling;if(!el||el.scrollWidth<=el.clientWidth)return;const y=Number(el.dataset.year);const c=(el.dataset.monthStartCols||'').split(',').map(Number);const p=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).format(new Date()).split('-');const cy=Number(p[0]);const cm=Number(p[1])-1;let n=0;if(y<cy){n=el.scrollWidth;}else if(y===cy){n=Math.max(0,(c[cm]||0)*14-4);}el.scrollLeft=n;})();`

/** 上記スクリプトの CSP 用ハッシュ (base64(sha256(script))) */
export const HEATMAP_SCROLL_INLINE_SCRIPT_HASH =
  "'sha256-NVzZZ6YiRk5NRoWLTLlFpLxN8d/dHUSl90LtBL3FwZI='"
