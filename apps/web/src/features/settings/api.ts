import type { GetUserSettingsResponse, SendRecommendationsEmailResponse, UpdateUserSettingsRequest, UpdateUserSettingsResponse } from "@tm/shared";
import { apiFetchJson } from "../../api/http";

export async function getSettings(signal?: AbortSignal): Promise<GetUserSettingsResponse> {
  return apiFetchJson<GetUserSettingsResponse>({ path: "/settings", signal });
}
export async function updateSettings(body: UpdateUserSettingsRequest): Promise<UpdateUserSettingsResponse> {
  return apiFetchJson<UpdateUserSettingsResponse>({ path: "/settings", method: "PUT", body });
}
export async function sendRecommendationsNow(): Promise<SendRecommendationsEmailResponse> {
  return apiFetchJson<SendRecommendationsEmailResponse>({ path: "/settings/send-recommendations", method: "POST", body: {} });
}
