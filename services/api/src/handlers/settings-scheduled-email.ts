import { listDueSettings } from "../settings/repo";
import { sendRecommendationsEmailForUser } from "../settings/recommendation-email";

export const handler = async () => {
  const due = await listDueSettings(new Date());
  const results = [];
  for (const item of due) {
    try { results.push({ sub: item.sub, ...(await sendRecommendationsEmailForUser(item.sub)) }); }
    catch (e: any) { results.push({ sub: item.sub, sent: false, message: e?.message || "Failed" }); }
  }
  return { processed: results.length, results };
};
