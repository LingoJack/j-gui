/**
 * 主内容区统一限宽容器，供 Chat / Agent 复用，避免两边再次写散后漂移。
 */
export const CENTERED_MAIN_CONTENT_CLASS =
  'flex flex-col flex-1 w-full max-w-[min(72rem,100%)] mx-auto overflow-hidden min-h-0'

/**
 * 主内容区的视觉内容限宽层。
 *
 * 外层可保持全宽承载滚动条，内部消息、输入框和横幅再用该类居中。
 */
export const CENTERED_MAIN_SURFACE_CLASS =
  'w-full max-w-[min(72rem,100%)] mx-auto'
