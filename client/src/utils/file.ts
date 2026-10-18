/** 触发浏览器下载一段文本（CSV 已带 BOM，Excel 打开中文不乱码） */
export function downloadText(content: string, filename: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 交给下一轮事件循环释放，避免部分浏览器下载还未开始就失效
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 生成 safe 的时间戳后缀，如 20261011_162233 */
export function timestampSuffix(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** 去掉文件名里的扩展名，并替换掉不适合做文件名的字符 */
export function safeFileStem(name: string): string {
  return name.replace(/\.[^./\\]+$/, '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'path';
}
