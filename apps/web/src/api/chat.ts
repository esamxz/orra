import { apiClient } from './client.js';
import type {
  ChatMessageDto,
  AppendProjectMessageInput,
  ListProjectMessagesParams,
  AppendProjectMessageResponse,
  ApprovalActionInput,
  ApprovalActionResponse,
} from './types.js';

// ---------------------------------------------------------------------------
// Chat API functions
// ---------------------------------------------------------------------------
// Thin wrappers over the API client. No business logic here.

export async function listProjectMessages(
  projectId: string,
  params?: ListProjectMessagesParams,
): Promise<ChatMessageDto[]> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  return apiClient.request<ChatMessageDto[]>(`/projects/${projectId}/messages${qs ? `?${qs}` : ''}`);
}

export async function appendProjectMessage(
  projectId: string,
  input: AppendProjectMessageInput,
): Promise<AppendProjectMessageResponse> {
  return apiClient.request<AppendProjectMessageResponse>(`/projects/${projectId}/messages`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function submitApprovalAction(
  projectId: string,
  messageId: string,
  input: ApprovalActionInput,
): Promise<ApprovalActionResponse> {
  return apiClient.request<ApprovalActionResponse>(
    `/projects/${projectId}/messages/${messageId}/approval-action`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}
