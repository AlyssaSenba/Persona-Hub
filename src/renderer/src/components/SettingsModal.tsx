import type { LabSettings, PersonaPatch, PublicSettings } from '@shared/types';

interface Props {
  settings: PublicSettings;
  form: LabSettings;
  apiKeyInput: string;
  saving: boolean;
  personaPath: string;
  patches: PersonaPatch[];
  onFormChange: (patch: Partial<LabSettings>) => void;
  onApiKeyChange: (value: string) => void;
  onSave: () => void;
  onClearKey: () => void;
  onRevert: (patchId: string) => void;
  onActivate: (patchId: string) => void;
  onClose: () => void;
}

export function SettingsModal(props: Props) {
  const { settings, form, apiKeyInput, saving, personaPath, patches } = props;
  const activePatches = patches.filter((patch) => patch.active);
  const inactivePatches = patches.filter((patch) => !patch.active);

  return (
    <div className="modal-backdrop">
      <div className="modal settings-modal" role="dialog" aria-modal="true" aria-label="设置">
        <header className="modal-head">
          <div>
            <h2>设置</h2>
            <p>名字、称呼、关系和调试入口。</p>
          </div>
          <button type="button" className="icon-button" onClick={props.onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="modal-body">
          <section className="form-section">
            <h3>他是谁</h3>
            <div className="field-grid">
              <label className="field">
                <span>AI 名字</span>
                <input
                  value={form.aiName}
                  onChange={(event) => props.onFormChange({ aiName: event.target.value })}
                  placeholder="例如：沈砚"
                />
              </label>
              <label className="field">
                <span>你对他的昵称（可选）</span>
                <input
                  value={form.aiNickname}
                  onChange={(event) => props.onFormChange({ aiNickname: event.target.value })}
                  placeholder="例如：砚"
                />
              </label>
              <label className="field">
                <span>关系</span>
                <select
                  value={form.relationship}
                  onChange={(event) =>
                    props.onFormChange({
                      relationship: event.target.value as LabSettings['relationship'],
                    })
                  }
                >
                  <option value="couple">情侣</option>
                  <option value="friend">朋友</option>
                  <option value="family">家人</option>
                  <option value="mentor">导师</option>
                  <option value="custom">自定义</option>
                </select>
              </label>
              <label className="field">
                <span>年龄感</span>
                <input value="21–27（人设内固定）" readOnly />
              </label>
            </div>
          </section>

          <section className="form-section">
            <h3>他怎么称呼你</h3>
            <div className="field-grid">
              <label className="field">
                <span>你的名字（可选）</span>
                <input
                  value={form.userName}
                  onChange={(event) => props.onFormChange({ userName: event.target.value })}
                  placeholder="例如：小六"
                />
              </label>
              <label className="field">
                <span>你的昵称（可选）</span>
                <input
                  value={form.userNickname}
                  onChange={(event) => props.onFormChange({ userNickname: event.target.value })}
                  placeholder="例如：六六"
                />
              </label>
              <label className="field">
                <span>称呼偏好</span>
                <select
                  value={form.addressPreference}
                  onChange={(event) =>
                    props.onFormChange({
                      addressPreference: event.target.value as LabSettings['addressPreference'],
                    })
                  }
                >
                  <option value="you">默认“你”</option>
                  <option value="name">多用名字</option>
                  <option value="nickname">多用昵称</option>
                  <option value="formal">用“您”</option>
                </select>
              </label>
            </div>
            <p className="hint">不会每句都叫名字；昵称需要你同意后才会用。</p>
          </section>

          <section className="form-section">
            <h3>关于你（选填）</h3>
            <div className="field-grid">
              <label className="field">
                <span>国籍 / 所在地</span>
                <input
                  value={form.nationality}
                  onChange={(event) => props.onFormChange({ nationality: event.target.value })}
                  placeholder="例如：中国"
                  maxLength={40}
                />
              </label>
              <label className="field">
                <span>性别</span>
                <select
                  value={form.userGender}
                  onChange={(event) =>
                    props.onFormChange({
                      userGender: event.target.value as LabSettings['userGender'],
                    })
                  }
                >
                  <option value="unspecified">不填</option>
                  <option value="male">男</option>
                  <option value="female">女</option>
                  <option value="none">无性别</option>
                </select>
              </label>
              <label className="field field-wide">
                <span>特殊注意事项</span>
                <textarea
                  value={form.userNotes}
                  onChange={(event) => props.onFormChange({ userNotes: event.target.value })}
                  placeholder="例如：怕吵；被追问会烦；某些话题请先问一句"
                  rows={3}
                  maxLength={500}
                />
              </label>
            </div>
            <p className="hint">
              只用于调整称呼、语气和分寸，不会当话题反复提。聊天里说“叫我某某”会立刻生效；要长期保留，回这里保存一次。
            </p>
          </section>

          <section className="form-section">
            <h3>调试入口</h3>
            <label className="field">
              <span>安全词（可选）</span>
              <input
                value={form.safeWord}
                onChange={(event) => props.onFormChange({ safeWord: event.target.value })}
                placeholder="例如：今天不演了"
              />
            </label>
            <p className="hint">
              在聊天中“完全等于”这个词时，会本地打开调试，不会发给模型。也可以按 Ctrl+Shift+D。
            </p>
          </section>

          <section className="form-section">
            <h3>模型</h3>
            <label className="field">
              <span>DeepSeek API Key</span>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(event) => props.onApiKeyChange(event.target.value)}
                placeholder={
                  settings.keySource === 'env'
                    ? '由 .env 提供；留空不改'
                    : settings.hasApiKey
                      ? '已保存；留空不修改'
                      : 'sk-...'
                }
                autoComplete="off"
              />
            </label>
            <div className="inline-row">
              <span className={settings.hasApiKey ? 'ok' : 'muted'}>
                {settings.keySource === 'env'
                  ? 'Key 来自 .env（每次请求实时读取）'
                  : settings.hasApiKey
                    ? 'Key 已保存（仅本次运行，重启需重填）'
                    : '未配置 Key'}
              </span>
              {settings.hasApiKey && settings.keySource !== 'env' ? (
                <button type="button" className="ghost small" onClick={props.onClearKey}>
                  清除 Key
                </button>
              ) : null}
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={form.demoMode}
                onChange={(event) => props.onFormChange({ demoMode: event.target.checked })}
              />
              <span>演示模式（不调用真实模型）</span>
            </label>
            <p className="hint">
              {settings.keySource === 'env'
                ? '当前使用 .env 里的 DEEPSEEK_API_KEY；改完 .env 下一次请求立即生效，不需要重启。'
                : '没有 Key 也能看界面；要真实调性格，关掉演示模式并填入 Key，或把它写进 .env。'}
            </p>
          </section>

          <section className="form-section">
            <h3>persona patch</h3>
            {activePatches.length === 0 ? (
              <p className="hint">没有生效中的 patch。打开调试，输入“别老反问”试试。</p>
            ) : (
              <div className="patch-list">
                {activePatches.map((patch) => (
                  <div className="patch-row" key={patch.id}>
                    <div>
                      <strong>{patch.title}</strong>
                      <p>{patch.rules.length} 条规则</p>
                    </div>
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => props.onRevert(patch.id)}
                    >
                      停用
                    </button>
                  </div>
                ))}
              </div>
            )}
            {inactivePatches.length > 0 ? (
              <>
                <p className="hint">已停用（文件还在，可重新启用）：</p>
                <div className="patch-list">
                  {inactivePatches.map((patch) => (
                    <div className="patch-row" key={patch.id}>
                      <div>
                        <strong>{patch.title}</strong>
                        <p>{patch.rules.length} 条规则 · 已停用</p>
                      </div>
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => props.onActivate(patch.id)}
                      >
                        重新启用
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </section>

          <section className="form-section">
            <h3>文件</h3>
            <p className="path-line" title={personaPath}>
              {personaPath}
            </p>
            <p className="hint">patch 会写到 config/persona-patches/，不会改 persona.md。</p>
          </section>
        </div>

        <footer className="modal-foot">
          <span className="hint">配置保存在项目的 config/ 目录。</span>
          <div className="modal-foot-right">
            <button type="button" className="ghost" onClick={props.onClose}>
              取消
            </button>
            <button type="button" className="primary" onClick={props.onSave} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
