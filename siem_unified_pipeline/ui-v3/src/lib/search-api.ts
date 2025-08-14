import { get, post } from "@/lib/http";
import type { ExecuteEnvelope, ExecuteRequestBody, AggsEnvelope, AggsRequestBody } from "@/types/search";

export const api = {
  health: () => get<any>("/health"),
  search: {
    execute: (body: ExecuteRequestBody) => post<ExecuteEnvelope>("/search/execute", body),
    aggs: (body: AggsRequestBody) => post<AggsEnvelope>("/search/aggs", body),
  },
};


