/**
 * AboutSettings - 关于页面
 *
 * 显示版本号和基本运行环境信息。
 */

import * as React from 'react'
import { Info } from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'

declare const __APP_VERSION__: string
const APP_VERSION = __APP_VERSION__

export function AboutSettings(): React.ReactElement {
  return (
    <SettingsSection title="关于 j-gui" description="j-cli Tauri 桌面客户端">
      <SettingsCard>
        <SettingsRow label="版本">
          <span className="text-sm text-muted-foreground font-mono">{APP_VERSION}</span>
        </SettingsRow>
        <SettingsRow label="运行时">
          <span className="text-sm text-muted-foreground">Tauri v2 + React + j-cli</span>
        </SettingsRow>
      </SettingsCard>
    </SettingsSection>
  )
}
