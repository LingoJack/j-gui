/**
 * 主内容区统一限宽容器，供 Chat / Agent 复用，避免两边再次写散后漂移。
 */
export const CENTERED_MAIN_CONTENT_CLASS =
  'flex flex-col flex-1 w-full max-w-[min(72rem,100%)] mx-auto overflow-hidden min-h-0'
