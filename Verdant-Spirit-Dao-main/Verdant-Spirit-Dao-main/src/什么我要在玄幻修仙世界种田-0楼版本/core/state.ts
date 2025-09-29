import { ref } from 'vue';

/**
 * 一个全局响应式引用，用于指示应用当前是否正在重算历史状态。
 * 当此值为 true 时，各个 store 的 watcher 应该只更新其内存状态，
 * 而不应将其中间状态持久化到酒馆变量中，以防止竞态条件和状态污染。
 * 状态重算的顶层函数（如 recalculateAndApplyState）将负责在所有事件处理完毕后，
 * 一次性将最终的、一致的状态写回。
 */
export const isRecalculating = ref(false);

/**
 * 获取当前是否正在重算状态的布尔值。
 * @returns {boolean}
 */
export const getIsRecalculatingState = () => isRecalculating.value;
