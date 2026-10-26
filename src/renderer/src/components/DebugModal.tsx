import type {
  ChatMessage,
  PersonaPatch,
  PersonaPatchProposal,
  PreviewResult,
} from '@shared/types';

interface Props {
  selectedMessage: ChatMessage | null;
  instruction: string;
  onInstructionChange: (value: string) => void;
  samples: string;
  onSamplesChange: (value: string) => void;
  proposal: PersonaPatchProposal | null;
  preview: PreviewResult | null;
  patches: PersonaPatch[];
  busy: 'propose' | 'preview' | '';
  onPropose: () => void;
  onPreview: () => void;
  onApply: () => void;
  onRevert: (patchId: string) => void;
  onClose: () => void;
}

export function DebugModal(props: Props) {
  const activePatches = props.patches.filter((patch) => patch.active);

  return (
    <div className="modal-backdrop">
      <div className="modal debug-modal" role="dialog" aria-modal="true" aria-label="调试人设">
        <header className="modal-head">
          <div>
            <h2>调试模式</h2>
            <p>AI 暂时不出场。先改人设，再回到对话。</p>
          </div>
          <button type="button" className="icon-button" onClick={props.onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="modal-body">
          <div className="debug-banner">
            这里是调试，不是聊天。你的指令只用来生成 patch；不会直接发给角色。
          </div>

          <section className="form-section">
            <h3>哪句不对？</h3>
            {props.selectedMessage ? (
              <div className="selected-quote">
                <div className="selected-meta">
                  {props.selectedMessage.role === 'user' ? '你' : '他'} · 已选中
                </div>
                <p>{props.selectedMessage.content}</p>
              </div>
            ) : (
              <p className="hint">在聊天里点一条消息，或直接写指令。</p>
            )}
          </section>

          <section className="form-section">
            <h3>你想怎么改？</h3>
            <textarea
              className="debug-input"
              value={props.instruction}
              onChange={(event) => props.onInstructionChange(event.target.value)}
              placeholder="例如：别老反问；少用“嗯”；别一听到“哄”就以为有人惹我；更主动一点；吃醋别太过。"
              rows={4}
            />
            <div className="inline-row">
              <button
                type="button"
                className="primary"
                onClick={props.onPropose}
                disabled={props.busy !== '' || !props.instruction.trim()}
              >
                {props.busy === 'propose' ? '生成中…' : '生成 patch'}
              </button>
              <span className="hint">先预览，再应用。</span>
            </div>
          </section>

          {props.proposal ? (
            <section className="form-section proposal-card">
              <div className="proposal-head">
                <div>
                  <h3>{props.proposal.title}</h3>
                  <p>{props.proposal.summary}</p>
                </div>
                <span className="badge">未应用</span>
              </div>

              <div className="proposal-block">
                <h4>规则</h4>
                <ul>
                  {props.proposal.rules.map((rule, index) => (
                    <li key={`${rule}-${index}`}>{rule}</li>
                  ))}
                </ul>
              </div>

              {props.proposal.examples.length ? (
                <div className="proposal-block">
                  <h4>示例语气</h4>
                  {props.proposal.examples.map((example, index) => (
                    <p className="example-line" key={`${example}-${index}`}>
                      “{example}”
                    </p>
                  ))}
                </div>
              ) : null}

              <div className="inline-row">
                <button
                  type="button"
                  className="ghost"
                  onClick={props.onPreview}
                  disabled={props.busy !== ''}
                >
                  {props.busy === 'preview' ? '预览中…' : '预览 3 句'}
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={props.onApply}
                  disabled={props.busy !== ''}
                >
                  应用 patch
                </button>
              </div>
            </section>
          ) : (
            <section className="form-section muted-box">
              <p>还没有 patch。写一句指令，点“生成 patch”。</p>
            </section>
          )}

          <section className="form-section">
            <h3>预览测试句</h3>
            <textarea
              className="debug-input small"
              value={props.samples}
              onChange={(event) => props.onSamplesChange(event.target.value)}
              rows={3}
            />
            {props.preview ? (
              <div className="preview-list">
                {props.preview.samples.map((sample, index) => (
                  <div className="preview-item" key={`${sample.input}-${index}`}>
                    <div className="preview-input">你：{sample.input}</div>
                    <div className="preview-before">
                      <span>现在</span>
                      <p>{sample.before}</p>
                    </div>
                    <div className="preview-after">
                      <span>应用后</span>
                      <p>{sample.after}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint">生成 patch 后点“预览 3 句”，看看差别。</p>
            )}
          </section>

          <section className="form-section">
            <h3>生效中的 patch</h3>
            {activePatches.length === 0 ? (
              <p className="hint">还没有生效的 patch。</p>
            ) : (
              <div className="patch-list">
                {activePatches.map((patch) => (
                  <div className="patch-row" key={patch.id}>
                    <div>
                      <strong>{patch.title}</strong>
                      <p>{patch.summary || `${patch.rules.length} 条规则`}</p>
                    </div>
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => props.onRevert(patch.id)}
                    >
                      回滚
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="modal-foot">
          <p className="hint">应用后下一轮生效；回滚可撤销。不能关闭安全/内容/危机边界。</p>
          <button type="button" className="ghost" onClick={props.onClose}>
            回到对话
          </button>
        </footer>
      </div>
    </div>
  );
}
