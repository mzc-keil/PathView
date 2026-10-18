import { useEffect, useMemo, useRef, useState } from 'react';
import type { ColumnMapping, CsvUploadResult } from '../types';
import { Icon } from './Icon';

const REQUIRED: Array<keyof ColumnMapping> = ['x', 'y', 'z'];
const OPTIONAL: Array<keyof ColumnMapping> = ['rx', 'ry', 'rz'];
const FIELD_LABEL: Record<string, string> = {
  x: 'X 坐标',
  y: 'Y 坐标',
  z: 'Z 坐标',
  rx: 'RX 姿态',
  ry: 'RY 姿态',
  rz: 'RZ 姿态',
};

export interface ColumnMapperProps {
  result: CsvUploadResult;
  busy: boolean;
  onHeaderRowChange: (headerRow: number) => void;
  onConfirm: (mapping: ColumnMapping, rows: Record<string, string>[]) => void;
  onCancel: () => void;
}

/**
 * CSV 列映射向导（两阶段导入的第二阶段）。
 *
 * 关键交互：切换表头行后 columns 数组会变，用户之前手选的映射可能失效 ——
 * 用 `result.columns.includes(current)` 判断是否仍然有效，有效就保留，失效才用服务端的新自动匹配。
 * 这样用户手改过的映射不会被重新解析冲掉。
 */
export function ColumnMapper({ result, busy, onHeaderRowChange, onConfirm, onCancel }: ColumnMapperProps) {
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>(result.mapping);
  const [useHeader, setUseHeader] = useState(result.hasHeader);
  const [headerRowIndex, setHeaderRowIndex] = useState(Math.max(result.headerRow, 0));
  const firstResult = useRef(true);

  useEffect(() => {
    setMapping((prev) => {
      const merged: Partial<ColumnMapping> = {};
      for (const key of [...REQUIRED, ...OPTIONAL]) {
        const current = prev[key];
        if (current && result.columns.includes(current)) {
          merged[key] = current;
        } else {
          const auto = result.mapping[key];
          if (auto) merged[key] = auto;
        }
      }
      return merged;
    });
    setUseHeader(result.hasHeader);
    setHeaderRowIndex(Math.max(result.headerRow, 0));
  }, [result]);

  useEffect(() => {
    firstResult.current = false;
  }, []);

  const missingRequired = REQUIRED.filter((k) => !mapping[k]);
  const ready = missingRequired.length === 0 && result.rowCount > 0;

  const previewRows = useMemo(() => result.rows.slice(0, 5), [result.rows]);
  const mappedSet = useMemo(
    () => new Set(Object.values(mapping).filter((v): v is string => typeof v === 'string')),
    [mapping]
  );
  const extraColumns = useMemo(
    () => result.columns.filter((c) => !mappedSet.has(c)),
    [result.columns, mappedSet]
  );

  const applyHeaderMode = (use: boolean, rowIdx: number) => {
    setUseHeader(use);
    setHeaderRowIndex(rowIdx);
    onHeaderRowChange(use ? rowIdx : -1);
  };

  return (
    <div className="modal-mask">
      <div className="modal mapper-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="panel-label">
            <Icon name="upload" size={14} />
            导入 CSV · 列映射
          </div>
          <button type="button" className="icon-btn" onClick={onCancel} title="取消">
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="mapper-meta">
          <span className="chip">{result.fileName}</span>
          <span className="chip">{result.rowCount} 行</span>
          <span className="chip">{result.totalColumns} 列</span>
          <span className="chip">编码 {result.encoding}</span>
          {result.detectedHeaderRow >= 0 && (
            <span className="chip chip-accent" title="服务端按列名命中率 + 单元格类型分布自动探测">
              自动识别的表头在第 {result.detectedHeaderRow + 1} 行
            </span>
          )}
        </div>

        <div className="modal-body mapper-body">
          <div className="mapper-section">
            <div className="panel-label panel-label-sub">表头处理</div>
            <div className="panel-sublabel">
              很多离线编程软件导出的 CSV 前几行是工件号 / 坐标系 / 时间戳等元信息，真正的表头不在第一行
            </div>
            <div className="segmented segmented-wide">
              <button
                type="button"
                className={`segmented-item${useHeader ? ' is-active' : ''}`}
                onClick={() => applyHeaderMode(true, headerRowIndex)}
              >
                有表头
              </button>
              <button
                type="button"
                className={`segmented-item${!useHeader ? ' is-active' : ''}`}
                onClick={() => applyHeaderMode(false, 0)}
              >
                无表头（按列序号）
              </button>
            </div>

            {useHeader && (
              <div className="header-picker">
                <span className="field-label">表头所在行</span>
                <div className="header-rows">
                  {result.rawPreview.map((row, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`header-row-btn${headerRowIndex === i ? ' is-active' : ''}`}
                      onClick={() => applyHeaderMode(true, i)}
                      title={row.join(' | ')}
                    >
                      <span className="header-row-idx">第 {i + 1} 行</span>
                      <span className="header-row-preview">
                        {row.slice(0, 6).join(' , ') || '(空行)'}
                        {row.length > 6 ? ' …' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="raw-preview">
              <div className="panel-sublabel">原始前 3 行</div>
              <table className="data-table compact">
                <tbody>
                  {result.rawPreview.map((row, i) => (
                    <tr key={i} className={useHeader && i === headerRowIndex ? 'row-header' : ''}>
                      <td className="col-idx">{i + 1}</td>
                      {row.map((cell, j) => (
                        <td key={j}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mapper-section">
            <div className="panel-label panel-label-sub">字段映射</div>
            {REQUIRED.map((key) => (
              <div className="field-row" key={key}>
                <span className={`field-label${!mapping[key] ? ' is-required' : ''}`}>
                  {FIELD_LABEL[key]}
                  <span className="required-mark">*</span>
                </span>
                <select
                  className={`select${!mapping[key] ? ' is-error' : ''}`}
                  value={mapping[key] ?? ''}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [key]: e.target.value || undefined }))}
                >
                  <option value="">— 未选择 —</option>
                  {result.columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {OPTIONAL.map((key) => (
              <div className="field-row" key={key}>
                <span className="field-label">{FIELD_LABEL[key]}</span>
                <select
                  className="select"
                  value={mapping[key] ?? ''}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [key]: e.target.value || undefined }))}
                >
                  <option value="">— 不导入 —</option>
                  {result.columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            {extraColumns.length > 0 && (
              <div className="panel-sublabel">
                未映射的 {extraColumns.length} 列会存进 extra 字段：{extraColumns.slice(0, 6).join('、')}
                {extraColumns.length > 6 ? ' …' : ''}
              </div>
            )}
          </div>

          <div className="mapper-section">
            <div className="panel-label panel-label-sub">数据预览（前 5 行）</div>
            <div className="table-scroll">
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th className="col-idx">#</th>
                    {result.columns.map((c) => (
                      <th key={c} className={mappedSet.has(c) ? 'col-mapped' : ''}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i}>
                      <td className="col-idx">{i + 1}</td>
                      {result.columns.map((c) => (
                        <td key={c} className={mappedSet.has(c) ? 'col-mapped' : ''}>
                          {row[c] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          {missingRequired.length > 0 ? (
            <span className="footer-hint is-error">必须先指定 {missingRequired.map((k) => FIELD_LABEL[k]).join(' / ')}</span>
          ) : (
            <span className="footer-hint">将导入 {result.rowCount} 个点</span>
          )}
          <div className="footer-actions">
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!ready || busy}
              onClick={() => {
                if (!ready) return;
                onConfirm(mapping as ColumnMapping, result.rows);
              }}
            >
              <Icon name="check" size={14} />
              {busy ? '导入中…' : '确认导入'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
