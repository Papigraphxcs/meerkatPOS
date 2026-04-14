<script setup lang="ts">
import { SelectValue } from "radix-vue";
import Select from "./Select.vue";
import SelectTriggerStyled from "./SelectTriggerStyled.vue";
import SelectItemStyled from "./SelectItemStyled.vue";
import SelectContentStyled from "./SelectContentStyled.vue";

export interface SelectItem {
	label: string;
	value: string;
}

const props = withDefaults(
	defineProps<{
		items: SelectItem[];
		placeholder?: string;
		disabled?: boolean;
		class?: string;
		side?: "top" | "bottom" | "left" | "right";
	}>(),
	{
		placeholder: "Select...",
		disabled: false,
	},
);

const modelValue = defineModel<string>({ default: "" });
</script>

<template>
	<Select :model-value="modelValue" @update:model-value="modelValue = $event as string">
		<SelectTriggerStyled :placeholder="placeholder" :disabled="disabled" :class="class">
			<SelectValue :placeholder="placeholder" />
		</SelectTriggerStyled>
		<SelectContentStyled :placeholder="placeholder" :disabled="disabled" :side="side">
			<SelectItemStyled
				v-for="opt in items.filter((i) => i.value !== '')"
				:key="opt.value"
				:value="opt.value"
			>
				{{ opt.label }}
			</SelectItemStyled>
		</SelectContentStyled>
	</Select>
</template>
