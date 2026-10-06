// Animated AAFE logo: vector mark + wordmark that cross-fades
// English → Spanish → Traditional Chinese → Korean, like the header on aafe.org.
//
// Measured from aafe.org's header GIF (264×70, 15 frames, ~6.2 s loop), Oct 5, 2026:
//   mark 34×34 at x=8, vertically centered · text starts 12px after the mark
//   EN/ES: 2 lines ~17.5px regular · ZH/KO: 1 line ~23.5px · text black
//   holds: EN 2.0s, ES 1.0s, ZH 1.0s, KO 1.0s · each cross-fade 0.3s
// Rebuilt in code so it stays sharp on Retina and the name is real text.
// Respects prefers-reduced-motion (shows English only).
//
// Usage:  <AafeLogo />                 // 70px tall, like aafe.org
//         <AafeLogo height={48} />     // scaled for a 64px top bar
import "./aafe-logo.css"

type Props = {
  height?: number
  className?: string
}

export function AafeMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 67 65"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12.95 6.37C12.95 2.85 10.05 0 6.48 0C2.91 0 0 2.85 0 6.37C0 9.89 2.9 12.74 6.47 12.74C10.04 12.74 12.94 9.89 12.94 6.37H12.95ZM32.57 12.74C36.14 12.74 39.04 9.89 39.04 6.37C39.04 2.85 36.14 0 32.57 0C29 0 26.09 2.85 26.09 6.37C26.09 9.89 28.99 12.74 32.57 12.74ZM60.53 0C56.96 0 54.06 2.85 54.06 6.37C54.06 9.89 56.96 12.74 60.53 12.74C64.1 12.74 67 9.89 67 6.37C67 2.85 64.1 0 60.53 0ZM32.49 23.15L19.25 10.13L2.54 26.57V64.99H9.51V49.17H29.02V64.99H36V49.17H55.5V64.99H62.47V26.57L45.75 10.12L32.51 23.14L32.49 23.15ZM29.01 42.31H9.51V29.4L19.26 19.81L29.02 29.41V42.31H29.01ZM55.49 42.31H35.99V29.4L45.74 19.81L55.49 29.41V42.31Z"
      />
    </svg>
  )
}

export default function AafeLogo({ height = 70, className = "" }: Props) {
  const scale = height / 70
  return (
    <span
      className={`aafe-logo ${className}`}
      style={{ ["--s" as string]: scale }}
      role="img"
      aria-label="Asian Americans for Equality"
    >
      <AafeMark className="aafe-logo__mark" />
      <span className="aafe-logo__words" aria-hidden="true">
        <span className="aafe-logo__word aafe-logo__word--en" lang="en">
          Asian Americans
          <br />
          for Equality
        </span>
        <span className="aafe-logo__word aafe-logo__word--es" lang="es">
          Asiáticos Americanos
          <br />
          por la Igualdad
        </span>
        <span className="aafe-logo__word aafe-logo__word--zh" lang="zh-Hant">
          亞洲人平等會
        </span>
        <span className="aafe-logo__word aafe-logo__word--ko" lang="ko">
          아주인 평등회
        </span>
      </span>
    </span>
  )
}
