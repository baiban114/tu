<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  type FormInstance,
  type FormRules,
} from 'element-plus';
import { useAuthStore } from '@/stores/auth';

type AuthMode = 'login' | 'register';

const authStore = useAuthStore();
const dialogVisible = ref(false);
const mode = ref<AuthMode>('login');
const formRef = ref<FormInstance | null>(null);

const form = reactive({
  account: '',
  username: '',
  email: '',
  displayName: '',
  password: '',
});

const dialogTitle = computed(() => (mode.value === 'login' ? '登录' : '注册'));
const submitText = computed(() => (mode.value === 'login' ? '登录' : '注册并登录'));

const loginRules: FormRules = {
  account: [
    { required: true, message: '请输入用户名或邮箱', trigger: 'blur' },
    { max: 128, message: '账号不能超过 128 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { max: 72, message: '密码不能超过 72 个字符', trigger: 'blur' },
  ],
};

const registerRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 64, message: '用户名长度为 3-64 个字符', trigger: 'blur' },
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
    { max: 128, message: '邮箱不能超过 128 个字符', trigger: 'blur' },
  ],
  displayName: [
    { max: 64, message: '昵称不能超过 64 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 72, message: '密码长度为 6-72 个字符', trigger: 'blur' },
  ],
};

const activeRules = computed(() => (mode.value === 'login' ? loginRules : registerRules));

function openDialog(nextMode: AuthMode) {
  mode.value = nextMode;
  dialogVisible.value = true;
  formRef.value?.clearValidate();
}

function switchMode(nextMode: AuthMode) {
  mode.value = nextMode;
  formRef.value?.clearValidate();
}

async function submit() {
  await formRef.value?.validate();

  try {
    if (mode.value === 'login') {
      await authStore.loginUser({
        account: form.account.trim(),
        password: form.password,
      });
      ElMessage.success('登录成功');
    } else {
      await authStore.registerUser({
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        displayName: form.displayName.trim() || undefined,
      });
      ElMessage.success('注册成功');
    }
    dialogVisible.value = false;
    form.password = '';
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
  }
}

function logout() {
  authStore.logout();
  ElMessage.success('已退出登录');
}
</script>

<template>
  <div class="auth-panel">
    <div v-if="authStore.isLoggedIn" class="auth-user">
      <div class="auth-avatar">
        {{ authStore.displayName.slice(0, 1).toUpperCase() }}
      </div>
      <div class="auth-user__main">
        <div class="auth-user__name">{{ authStore.displayName }}</div>
        <div class="auth-user__email">{{ authStore.user?.email }}</div>
      </div>
      <el-button class="auth-link" link size="small" @click="logout">退出</el-button>
    </div>

    <div v-else class="auth-actions">
      <div class="auth-copy">
        <div class="auth-copy__title">未登录</div>
        <div class="auth-copy__text">可继续使用当前工作区</div>
      </div>
      <div class="auth-actions__buttons">
        <el-button size="small" @click="openDialog('register')">注册</el-button>
        <el-button type="primary" size="small" @click="openDialog('login')">登录</el-button>
      </div>
    </div>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="380px" append-to-body>
      <el-form
        ref="formRef"
        :model="form"
        :rules="activeRules"
        label-position="top"
        @submit.prevent
      >
        <template v-if="mode === 'login'">
          <el-form-item label="用户名或邮箱" prop="account">
            <el-input v-model="form.account" autocomplete="username" />
          </el-form-item>
        </template>

        <template v-else>
          <el-form-item label="用户名" prop="username">
            <el-input v-model="form.username" autocomplete="username" />
          </el-form-item>
          <el-form-item label="邮箱" prop="email">
            <el-input v-model="form.email" autocomplete="email" />
          </el-form-item>
          <el-form-item label="昵称" prop="displayName">
            <el-input v-model="form.displayName" autocomplete="nickname" />
          </el-form-item>
        </template>

        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            autocomplete="current-password"
            show-password
            @keyup.enter="submit"
          />
        </el-form-item>
      </el-form>

      <div class="mode-switch">
        <button v-if="mode === 'login'" type="button" @click="switchMode('register')">
          创建新账号
        </button>
        <button v-else type="button" @click="switchMode('login')">
          使用已有账号登录
        </button>
      </div>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="authStore.loading" @click="submit">
          {{ submitText }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.auth-panel {
  padding: 12px;
  border-bottom: 1px solid #e4e4e4;
  background: #fff;
}

.auth-user,
.auth-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.auth-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: #1677ff;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}

.auth-user__main,
.auth-copy {
  flex: 1;
  min-width: 0;
}

.auth-user__name,
.auth-copy__title {
  font-size: 13px;
  font-weight: 600;
  color: #1f1f1f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auth-user__email,
.auth-copy__text {
  margin-top: 2px;
  font-size: 12px;
  color: #8c8c8c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auth-link {
  flex-shrink: 0;
}

.auth-actions__buttons {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.mode-switch {
  margin-top: 2px;
}

.mode-switch button {
  border: 0;
  padding: 0;
  background: transparent;
  color: #1677ff;
  font-size: 13px;
  cursor: pointer;
}
</style>
