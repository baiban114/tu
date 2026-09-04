<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import {
  askKnowledgeBaseStream,
  getKnowledgeChatConversation,
  listKnowledgeChatSessions,
  type KnowledgeChatMessage,
  type KnowledgeChatStreamPhase,
  type KnowledgeChatSession,
  type KnowledgeChatSource,
} from '@/api/knowledgeChat'
import { listKnowledgeBases } from '@/api/knowledge'
import type { KnowledgeBase } from '@/api/types'
import { useAuthStore } from '@/stores/auth'

interface DisplayMessage extends KnowledgeChatMessage {
  id: string
  sources?: KnowledgeChatSource[]
  reasoningContent?: string | null
  selectedKbId?: string
  selectedKbName?: string
  reasoningExpanded?: boolean
  streaming?: boolean
  mode?: 'fast' | 'deep'
  executionSteps?: ExecutionStep[]
}

interface ExecutionStep {
  id: string
  phase: Extract<KnowledgeChatStreamPhase, 'model_call' | 'tool_call' | 'tool_done'>
  message: string
  round?: number | null
  toolName?: string | null
  status: 'active' | 'done'
}

const router = useRouter()
const auth = useAuthStore()
const knowledgeBases = ref<KnowledgeBase[]>([])
const selectedKbId = ref('')
const question = ref('')
const loading = ref(false)
const chatMode = ref<'fast' | 'deep'>('fast')
const messages = ref<DisplayMessage[]>([])
const sessions = ref<KnowledgeChatSession[]>([])
const activeConversationId = ref('')
const sessionPage = ref(0)
const sessionTotal = ref(0)
const sessionLoading = ref(false)
const conversationLoading = ref(false)
const messageRegion = ref<HTMLElement | null>(null)
let activeRequest: AbortController | null = null
const SESSION_PAGE_SIZE = 20

const selectedKnowledgeBase = computed(() => knowledgeBases.value.find((item) => item.id === selectedKbId.value))
const currentUserLabel = computed(() => auth.displayName || '本地测试用户')
const currentUserId = computed(() => auth.user?.id || 'dev-local-user')
const canSend = computed(() => Boolean(question.value.trim() && !loading.value && knowledgeBases.value.length > 0))
const hasMoreSessions = computed(() => sessions.value.length < sessionTotal.value)

onMounted(async () => {
  const sessionRequest = loadSessions(true)
  try {
    knowledgeBases.value = await listKnowledgeBases()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载知识库失败')
  }
  await sessionRequest
})

onBeforeUnmount(() => activeRequest?.abort())

async function scrollToBottom() {
  await nextTick()
  messageRegion.value?.scrollTo({ top: messageRegion.value.scrollHeight, behavior: 'smooth' })
}

async function loadSessions(reset = false) {
  if (sessionLoading.value) return
  sessionLoading.value = true
  try {
    const nextPage = reset ? 0 : sessionPage.value
    const result = await listKnowledgeChatSessions(nextPage, SESSION_PAGE_SIZE, currentUserId.value)
    sessions.value = reset ? result.items : [...sessions.value, ...result.items]
    sessionTotal.value = result.total
    sessionPage.value = nextPage + 1
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载历史会话失败')
  } finally {
    sessionLoading.value = false
  }
}

async function openConversation(session: KnowledgeChatSession) {
  if (loading.value || conversationLoading.value || session.id === activeConversationId.value) return
  conversationLoading.value = true
  try {
    const conversation = await getKnowledgeChatConversation(session.id, currentUserId.value)
    activeConversationId.value = conversation.id
    selectedKbId.value = ''
    messages.value = conversation.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      sources: message.sources,
      reasoningContent: message.reasoningContent,
      selectedKbId: message.selectedKbId || undefined,
      selectedKbName: message.selectedKbName || undefined,
      reasoningExpanded: false,
      streaming: false,
    }))
    await scrollToBottom()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载会话失败')
  } finally {
    conversationLoading.value = false
  }
}

function onSessionListScroll(event: Event) {
  const element = event.currentTarget as HTMLElement
  const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80
  if (nearBottom && hasMoreSessions.value && !sessionLoading.value && !loading.value) {
    void loadSessions()
  }
}

async function sendQuestion() {
  const content = question.value.trim()
  if (!content || !canSend.value) return
  const history = messages.value.slice(-12).map(({ role, content: text }) => ({ role, content: text }))
  messages.value.push({ id: `user-${Date.now()}`, role: 'user', content })
  question.value = ''
  loading.value = true
  const assistantMessage = reactive<DisplayMessage>({
    id: `assistant-${Date.now()}`,
    role: 'assistant',
    content: '',
    reasoningContent: '',
    reasoningExpanded: false,
    streaming: true,
    mode: chatMode.value,
    executionSteps: [],
  })
  messages.value.push(assistantMessage)
  let reasoningStarted = false
  let answerStarted = false
  activeRequest = new AbortController()
  await scrollToBottom()
  try {
    const response = await askKnowledgeBaseStream(
      {
        kbId: selectedKbId.value || undefined,
        question: content,
        messages: history,
        conversationId: activeConversationId.value || undefined,
        mode: chatMode.value,
      },
      currentUserId.value,
      {
        signal: activeRequest.signal,
        onEvent(event) {
          if (event.phase === 'reasoning_delta' && event.delta) {
            assistantMessage.reasoningContent = `${assistantMessage.reasoningContent || ''}${event.delta}`
            if (!reasoningStarted) {
              reasoningStarted = true
              assistantMessage.reasoningExpanded = true
            }
          } else if (event.phase === 'answer_delta' && event.delta) {
            assistantMessage.content += event.delta
            if (!answerStarted) {
              answerStarted = true
              assistantMessage.reasoningExpanded = false
            }
          } else if (
            event.phase === 'model_call'
            || event.phase === 'tool_call'
            || event.phase === 'tool_done'
          ) {
            updateExecutionSteps(assistantMessage, {
              phase: event.phase,
              message: event.message,
              round: event.round,
              toolName: event.toolName,
            })
          }
          void scrollToBottom()
        },
      },
    )
    assistantMessage.content = response.answer
    assistantMessage.sources = response.sources
    assistantMessage.reasoningContent = response.reasoningContent
    assistantMessage.selectedKbId = response.selectedKbId
    assistantMessage.selectedKbName = response.selectedKbName
    activeConversationId.value = response.conversationId
    await loadSessions(true)
  } catch (error) {
    messages.value = messages.value.filter((message) => message !== assistantMessage)
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      ElMessage.error(error instanceof Error ? error.message : '知识库问答失败')
    }
  } finally {
    assistantMessage.streaming = false
    activeRequest = null
    loading.value = false
    await scrollToBottom()
  }
}

function updateExecutionSteps(
  message: DisplayMessage,
  event: {
    phase: 'model_call' | 'tool_call' | 'tool_done'
    message?: string | null
    round?: number | null
    toolName?: string | null
  },
) {
  const steps = message.executionSteps || (message.executionSteps = [])
  if (event.phase === 'tool_done') {
    const activeToolStep = [...steps].reverse().find((step) => (
      step.phase === 'tool_call'
      && step.status === 'active'
      && step.toolName === event.toolName
    ))
    if (activeToolStep) {
      activeToolStep.status = 'done'
      activeToolStep.message = event.message || activeToolStep.message
      return
    }
  }
  steps.push({
    id: `${event.phase}-${steps.length}-${Date.now()}`,
    phase: event.phase,
    message: event.message || '正在处理',
    round: event.round,
    toolName: event.toolName,
    status: event.phase === 'tool_call' ? 'active' : 'done',
  })
}

function onQuestionKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  void sendQuestion()
}

function startNewConversation() {
  activeConversationId.value = ''
  messages.value = []
  selectedKbId.value = ''
  question.value = ''
}

function formatSessionTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function openSource(source: KnowledgeChatSource) {
  void router.push({ path: '/', query: { pageId: source.pageId } })
}
</script>

<template>
  <main class="knowledge-chat-page">
    <header class="knowledge-chat-header">
      <div>
        <button class="back-link" type="button" @click="router.push('/')">← 返回工作区</button>
        <h1>知识库问答</h1>
        <p>基于当前用户的知识库内容检索证据并生成专业回答。</p>
      </div>
      <div class="header-actions">
        <span class="user-chip">用户：{{ currentUserLabel }}</span>
        <button type="button" class="secondary-button" :disabled="loading" @click="startNewConversation">
          + 新对话
        </button>
      </div>
    </header>

    <section class="knowledge-chat-shell" aria-label="知识库问答工作区">
      <aside class="conversation-sidebar" aria-label="历史会话">
        <div class="conversation-sidebar__header">历史会话</div>
        <div class="conversation-list" @scroll="onSessionListScroll">
          <button
            v-for="session in sessions"
            :key="session.id"
            type="button"
            class="conversation-item"
            :class="{ 'conversation-item--active': session.id === activeConversationId }"
            :disabled="loading || conversationLoading"
            @click="openConversation(session)"
          >
            <span class="conversation-item__title">{{ session.title }}</span>
            <span class="conversation-item__meta">
              <span>{{ session.selectedKbName || '自动选择' }}</span>
              <time :datetime="session.createdAt">{{ formatSessionTime(session.createdAt) }}</time>
            </span>
          </button>
          <div v-if="sessionLoading" class="conversation-list__status">正在加载…</div>
          <div v-else-if="sessions.length === 0" class="conversation-list__status">暂无历史会话</div>
        </div>
      </aside>

      <div class="chat-workspace">
        <div class="knowledge-chat-toolbar">
        <label for="knowledge-base-select">知识库</label>
        <select id="knowledge-base-select" v-model="selectedKbId" :disabled="loading">
          <option value="">自动选择知识库</option>
          <option v-for="item in knowledgeBases" :key="item.id" :value="item.id">
            {{ item.icon }} {{ item.name }}
          </option>
        </select>
        <span v-if="selectedKnowledgeBase?.description" class="kb-description">{{ selectedKnowledgeBase.description }}</span>
        <span v-else-if="!selectedKbId" class="kb-description">根据问题意图从你可访问的知识库中选择</span>
        <div class="chat-mode-segment" role="group" aria-label="问答模式">
          <button
            type="button"
            :class="{ 'chat-mode-segment__button--active': chatMode === 'fast' }"
            :aria-pressed="chatMode === 'fast'"
            :disabled="loading"
            @click="chatMode = 'fast'"
          >
            快速问答
          </button>
          <button
            type="button"
            :class="{ 'chat-mode-segment__button--active': chatMode === 'deep' }"
            :aria-pressed="chatMode === 'deep'"
            :disabled="loading"
            @click="chatMode = 'deep'"
          >
            深度问答
          </button>
        </div>
        </div>

        <div ref="messageRegion" class="knowledge-chat-messages" aria-live="polite">
        <div v-if="messages.length === 0" class="chat-empty">
          <div class="chat-empty__icon">✦</div>
          <h2>从你的知识内容中寻找答案</h2>
          <p>直接提问可自动选择知识库，也可以在上方指定范围。回答会附带可回到原文的来源。</p>
        </div>
        <article v-for="message in messages" :key="message.id" class="chat-message" :class="`chat-message--${message.role}`">
          <div class="chat-message__role">{{ message.role === 'user' ? '你' : '知识库助手' }}</div>
          <div v-if="message.role === 'assistant' && message.selectedKbName" class="selected-kb-badge">
            使用知识库：{{ message.selectedKbName }}
          </div>
          <details
            v-if="message.reasoningContent"
            class="reasoning-panel"
            :open="message.reasoningExpanded"
            @toggle="message.reasoningExpanded = ($event.currentTarget as HTMLDetailsElement).open"
          >
            <summary>内部思维链</summary>
            <pre>{{ message.reasoningContent }}<span v-if="message.streaming && message.reasoningExpanded" class="streaming-cursor" /></pre>
          </details>
          <section v-if="message.executionSteps?.length" class="execution-trace" aria-label="执行轨迹">
            <div class="execution-trace__title">执行轨迹</div>
            <div class="execution-trace__steps">
              <div
                v-for="step in message.executionSteps"
                :key="step.id"
                class="execution-step"
                :class="{ 'execution-step--active': step.status === 'active' }"
              >
                <span class="execution-step__status" aria-hidden="true" />
                <span>{{ step.message }}</span>
              </div>
            </div>
          </section>
          <div class="chat-message__content">
            {{ message.content }}<span v-if="message.streaming && message.content" class="streaming-cursor" />
            <span v-if="message.streaming && !message.content && !message.reasoningContent" class="streaming-placeholder">正在检索知识库…</span>
          </div>
          <div v-if="message.sources?.length" class="chat-sources">
            <div class="chat-sources__title">参考来源</div>
            <button
              v-for="(source, index) in message.sources"
              :key="`${source.pageId}-${source.blockId || index}`"
              type="button"
              class="source-card"
              @click="openSource(source)"
            >
              <strong>[来源{{ index + 1 }}] {{ source.title }}</strong>
              <span>{{ source.content }}</span>
            </button>
          </div>
        </article>
        </div>

        <form class="knowledge-chat-composer" @submit.prevent="sendQuestion">
        <textarea
          v-model="question"
          maxlength="4000"
          rows="3"
          placeholder="输入问题，Enter 发送，Shift + Enter 换行"
          :disabled="loading || knowledgeBases.length === 0"
          aria-label="知识库问题"
          @keydown="onQuestionKeydown"
        />
        <div class="composer-footer">
          <span>{{ question.length }}/4000</span>
          <button type="submit" class="primary-button" :disabled="!canSend">{{ loading ? '回答中…' : '发送问题' }}</button>
        </div>
        </form>
      </div>
    </section>
  </main>
</template>

<style scoped>
.knowledge-chat-page { height: 100vh; overflow: hidden; box-sizing: border-box; padding: 24px; background: #f5f7fb; color: #1f2937; display: flex; flex-direction: column; gap: 18px; }
.knowledge-chat-header { flex: 0 0 auto; display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
.knowledge-chat-header h1 { margin: 8px 0 4px; font-size: 26px; }
.knowledge-chat-header p { margin: 0; color: #667085; }
.back-link { padding: 0; border: 0; background: transparent; color: #315efb; cursor: pointer; }
.header-actions { display: flex; align-items: center; gap: 12px; }
.user-chip { padding: 7px 11px; border-radius: 999px; background: #e9efff; color: #304b9a; font-size: 13px; }
.knowledge-chat-shell { flex: 1; min-height: 0; width: min(100%, 1280px); margin: 0 auto; display: flex; overflow: hidden; border: 1px solid #dfe4ee; border-radius: 8px; background: #fff; box-shadow: 0 8px 26px rgb(31 41 55 / 7%); }
.conversation-sidebar { flex: 0 0 260px; min-width: 0; display: flex; flex-direction: column; border-right: 1px solid #e1e6ef; background: #f8f9fc; }
.conversation-sidebar__header { flex: 0 0 auto; padding: 18px 16px 12px; color: #344054; font-size: 13px; font-weight: 700; }
.conversation-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0 8px 12px; }
.conversation-item { width: 100%; min-height: 62px; padding: 10px; border: 0; border-radius: 6px; background: transparent; color: #344054; text-align: left; cursor: pointer; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
.conversation-item:hover { background: #edf1f7; }
.conversation-item--active { background: #e5ebf8; color: #203e85; }
.conversation-item__title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 600; }
.conversation-item__meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #7b8495; font-size: 11px; }
.conversation-item__meta span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conversation-item__meta time { flex: 0 0 auto; }
.conversation-list__status { padding: 18px 8px; color: #8992a3; text-align: center; font-size: 12px; }
.chat-workspace { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.knowledge-chat-toolbar { flex: 0 0 auto; min-height: 58px; padding: 10px 18px; border-bottom: 1px solid #e8ebf1; display: flex; align-items: center; gap: 10px; }
.knowledge-chat-toolbar label { font-weight: 600; }
.knowledge-chat-toolbar select { min-width: 230px; padding: 8px 10px; border: 1px solid #ccd3df; border-radius: 7px; background: #fff; }
.kb-description { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #7b8495; font-size: 13px; }
.chat-mode-segment { flex: 0 0 auto; margin-left: auto; padding: 3px; border: 1px solid #d2d8e2; border-radius: 7px; background: #f3f5f8; display: flex; }
.chat-mode-segment button { min-width: 88px; min-height: 32px; padding: 5px 10px; border: 0; border-radius: 5px; background: transparent; color: #667085; cursor: pointer; }
.chat-mode-segment .chat-mode-segment__button--active { background: #fff; color: #203e85; box-shadow: 0 1px 3px rgb(31 41 55 / 12%); font-weight: 600; }
.knowledge-chat-messages { flex: 1; min-height: 0; overflow-y: auto; padding: 24px; background: #fafbfe; }
.chat-empty { height: 100%; min-height: 240px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #697386; }
.chat-empty__icon { width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; background: #e8edff; color: #315efb; font-size: 24px; }
.chat-empty h2 { margin: 14px 0 6px; color: #273449; font-size: 20px; }
.chat-empty p { max-width: 560px; margin: 0; line-height: 1.7; }
.chat-message { max-width: 82%; margin-bottom: 18px; }
.chat-message--user { margin-left: auto; }
.chat-message__role { margin: 0 4px 6px; color: #717b8d; font-size: 12px; }
.chat-message--user .chat-message__role { text-align: right; }
.selected-kb-badge { margin: 0 4px 7px; color: #526581; font-size: 12px; }
.reasoning-panel { margin-bottom: 8px; border: 1px solid #d7dde8; border-radius: 7px; background: #f5f7fa; color: #465266; }
.reasoning-panel summary { padding: 9px 11px; cursor: pointer; font-size: 13px; font-weight: 600; user-select: none; }
.reasoning-panel pre { max-height: 320px; margin: 0; padding: 10px 12px; overflow: auto; border-top: 1px solid #d7dde8; font: 12px/1.65 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.execution-trace { height: 132px; margin-bottom: 8px; overflow: hidden; border: 1px solid #d7dde8; border-radius: 7px; background: #f7f9fc; color: #465266; display: flex; flex-direction: column; }
.execution-trace__title { flex: 0 0 auto; padding: 9px 11px 7px; border-bottom: 1px solid #e1e5ec; font-size: 13px; font-weight: 600; }
.execution-trace__steps { flex: 1; min-height: 0; overflow-y: auto; padding: 7px 11px; }
.execution-step { min-height: 24px; display: flex; align-items: center; gap: 8px; font-size: 12px; }
.execution-step__status { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; background: #46a06f; }
.execution-step--active .execution-step__status { background: #315efb; box-shadow: 0 0 0 3px rgb(49 94 251 / 14%); }
.chat-message__content { padding: 12px 15px; border: 1px solid #e0e5ee; border-radius: 12px; background: #fff; line-height: 1.7; white-space: pre-wrap; }
.chat-message--user .chat-message__content { border-color: #315efb; background: #315efb; color: #fff; }
.chat-sources { margin-top: 9px; padding: 10px; border: 1px solid #e0e5ee; border-radius: 10px; background: #fff; }
.chat-sources__title { margin-bottom: 7px; color: #687386; font-size: 12px; font-weight: 600; }
.source-card { width: 100%; padding: 9px 10px; border: 0; border-radius: 7px; background: #f5f7fb; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 3px; }
.source-card + .source-card { margin-top: 7px; }
.source-card:hover { background: #e9efff; }
.source-card span { color: #697386; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.streaming-placeholder { color: #7b8495; }
.streaming-cursor { display: inline-block; width: 2px; height: 1em; margin-left: 2px; vertical-align: -2px; background: currentColor; animation: cursor-blink 900ms steps(1) infinite; }
@keyframes cursor-blink { 50% { opacity: 0; } }
.knowledge-chat-composer { flex: 0 0 auto; padding: 14px 18px; border-top: 1px solid #e1e6ef; background: #fff; }
.knowledge-chat-composer textarea { width: 100%; resize: none; box-sizing: border-box; padding: 11px 12px; border: 1px solid #cdd5e1; border-radius: 9px; font: inherit; line-height: 1.5; }
.knowledge-chat-composer textarea:focus { outline: 2px solid rgb(49 94 251 / 18%); border-color: #315efb; }
.composer-footer { margin-top: 8px; display: flex; align-items: center; justify-content: space-between; color: #8992a3; font-size: 12px; }
.primary-button, .secondary-button { border-radius: 7px; padding: 8px 14px; cursor: pointer; }
.primary-button { border: 1px solid #315efb; background: #315efb; color: #fff; }
.secondary-button { border: 1px solid #cfd6e2; background: #fff; color: #344054; }
button:disabled, textarea:disabled, select:disabled { cursor: not-allowed; opacity: .55; }
@media (max-width: 720px) { .knowledge-chat-page { padding: 12px; } .knowledge-chat-header { align-items: flex-start; flex-direction: column; } .header-actions { width: 100%; justify-content: space-between; } .knowledge-chat-shell { flex-direction: column; } .conversation-sidebar { flex: 0 0 130px; border-right: 0; border-bottom: 1px solid #e1e6ef; } .knowledge-chat-toolbar { align-items: flex-start; flex-direction: column; } .knowledge-chat-toolbar select { width: 100%; } .chat-mode-segment { width: 100%; margin-left: 0; box-sizing: border-box; } .chat-mode-segment button { flex: 1; min-width: 0; } .chat-empty { min-height: 0; padding: 12px; box-sizing: border-box; } .chat-empty__icon { width: 44px; height: 44px; } .chat-empty h2 { margin: 8px 0 4px; font-size: 18px; } .chat-empty p { line-height: 1.5; } .chat-message { max-width: 95%; } }
</style>
