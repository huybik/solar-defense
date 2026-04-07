export interface UIElements {
  shell: HTMLDivElement
  stage: HTMLDivElement
  topbar: HTMLDivElement
  sidebar: HTMLDivElement
  panel: HTMLDivElement
  banner: HTMLDivElement
  support: HTMLDivElement
  peerBar: HTMLDivElement
}

export function buildShell(root: HTMLElement): UIElements {
  root.innerHTML = `
    <div class="solar-shell">
      <div class="solar-stage"></div>
      <div class="solar-overlay">
        <div class="solar-topbar"></div>
        <div class="solar-sidebar"></div>
        <div class="solar-panel"></div>
        <div class="solar-banner"></div>
        <div class="solar-support"></div>
      </div>
      <div class="solar-peers"></div>
    </div>
  `

  const q = <T extends HTMLElement>(sel: string): T => {
    const el = root.querySelector<T>(sel)
    if (!el) throw new Error(`Missing UI element: ${sel}`)
    return el
  }

  return {
    shell: q<HTMLDivElement>('.solar-shell'),
    stage: q<HTMLDivElement>('.solar-stage'),
    topbar: q<HTMLDivElement>('.solar-topbar'),
    sidebar: q<HTMLDivElement>('.solar-sidebar'),
    panel: q<HTMLDivElement>('.solar-panel'),
    banner: q<HTMLDivElement>('.solar-banner'),
    support: q<HTMLDivElement>('.solar-support'),
    peerBar: q<HTMLDivElement>('.solar-peers'),
  }
}
