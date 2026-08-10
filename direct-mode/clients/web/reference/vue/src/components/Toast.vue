<script setup lang="ts">
import { useToast } from '../composables/useToast'

const { messages, dismiss } = useToast()
</script>

<template>
  <div v-if="messages.length" class="toast-stack">
    <div
      v-for="m in messages"
      :key="m.id"
      :class="['toast', `toast-${m.kind}`]"
      role="alert"
    >
      <span class="toast-text">{{ m.text }}</span>
      <button class="toast-close" aria-label="Dismiss" @click="dismiss(m.id)">×</button>
    </div>
  </div>
</template>
