import { escapeHtml } from '../../utils'

export function renderSupport(fatalError: string): { className: string; html: string } {
  if (!fatalError) {
    return {
      className: 'solar-support',
      html: '',
    }
  }

  return {
    className: 'solar-support visible',
    html: `
      <div class="support-card">
        <h2>WebGPU Required</h2>
        <p>${escapeHtml(fatalError)}</p>
      </div>
    `,
  }
}
