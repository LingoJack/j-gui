import { atom } from "jotai";

export interface ProviderInfo {
  name: string;
  apiBase: string;
  apiKey: string;
  model: string;
  supportsVision: boolean;
}

export interface AgentConfigInfo {
  providers: ProviderInfo[];
  activeIndex: number;
}

export const agentConfigAtom = atom<AgentConfigInfo>({
  providers: [],
  activeIndex: 0,
});

export const activeProviderAtom = atom((get) => {
  const config = get(agentConfigAtom);
  return config.providers[config.activeIndex] ?? null;
});
