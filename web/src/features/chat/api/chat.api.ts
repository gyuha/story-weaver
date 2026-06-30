// chat 도메인 API facade — 생성 SDK(@/api)를 감싼다.
// non-streaming JSON 경로만 다룬다. SSE 스트리밍 엔드포인트
// (postApiV1ChatStream)와 stream: true 메시지 전송은 의도적으로 감싸지 않는다.
// 직접 호출 함수는 throwOnError: true로 성공 데이터만 반환하고,
// Query/mutation option은 도메인 이름으로 다시 노출한다.
import {
  type GetApiV1ChatConversationsByConversationIdData,
  type GetApiV1ChatConversationsByConversationIdMessagesData,
  type GetApiV1ChatConversationsData,
  type GetApiV1ChatProviderData,
  type Options,
  type PostApiV1ChatCompleteData,
  type PostApiV1ChatConversationsByConversationIdMessagesData,
  type PostApiV1ChatConversationsData,
  getApiV1ChatConversations,
  getApiV1ChatConversationsByConversationId,
  getApiV1ChatConversationsByConversationIdMessages,
  getApiV1ChatProvider,
  postApiV1ChatComplete,
  postApiV1ChatConversations,
  postApiV1ChatConversationsByConversationIdMessages,
} from '@/api';
import {
  getApiV1ChatConversationsByConversationIdMessagesOptions,
  getApiV1ChatConversationsByConversationIdOptions,
  getApiV1ChatConversationsOptions,
  getApiV1ChatProviderOptions,
  postApiV1ChatCompleteMutation,
  postApiV1ChatConversationsByConversationIdMessagesMutation,
  postApiV1ChatConversationsMutation,
} from '@/api/@tanstack/react-query.gen';

export const chatApi = {
  // non-streaming 단발 completion
  async complete(options: Options<PostApiV1ChatCompleteData>) {
    const { data } = await postApiV1ChatComplete({ ...options, throwOnError: true });
    return data;
  },
  async provider(options?: Options<GetApiV1ChatProviderData>) {
    const { data } = await getApiV1ChatProvider({ ...options, throwOnError: true });
    return data;
  },
  async conversations(options?: Options<GetApiV1ChatConversationsData>) {
    const { data } = await getApiV1ChatConversations({ ...options, throwOnError: true });
    return data;
  },
  async createConversation(options: Options<PostApiV1ChatConversationsData>) {
    const { data } = await postApiV1ChatConversations({ ...options, throwOnError: true });
    return data;
  },
  async conversation(options: Options<GetApiV1ChatConversationsByConversationIdData>) {
    const { data } = await getApiV1ChatConversationsByConversationId({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async messages(options: Options<GetApiV1ChatConversationsByConversationIdMessagesData>) {
    const { data } = await getApiV1ChatConversationsByConversationIdMessages({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  // stream: false 메시지 전송 (JSON 응답). 스트리밍이 필요하면 별도 SSE 경로를 쓴다.
  async sendMessage(options: Options<PostApiV1ChatConversationsByConversationIdMessagesData>) {
    const { data } = await postApiV1ChatConversationsByConversationIdMessages({
      ...options,
      throwOnError: true,
    });
    return data;
  },
};

export const chatQueries = {
  provider: getApiV1ChatProviderOptions,
  conversations: getApiV1ChatConversationsOptions,
  conversation: getApiV1ChatConversationsByConversationIdOptions,
  messages: getApiV1ChatConversationsByConversationIdMessagesOptions,
};

export const chatMutations = {
  complete: postApiV1ChatCompleteMutation,
  createConversation: postApiV1ChatConversationsMutation,
  sendMessage: postApiV1ChatConversationsByConversationIdMessagesMutation,
};
