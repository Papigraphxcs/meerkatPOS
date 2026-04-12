<template>
	<div class="flex flex-wrap items-center gap-2">
		<template v-for="field in resolvedFields" :key="field.fieldname">
			<Autocomplete
				v-if="field.fieldtype === 'Link'"
				:model-value="(modelFilters[field.fieldname] as string) || ''"
				:options="linkOptions[field.fieldname] || []"
				:placeholder="field.label || field.fieldname"
				:remote-search="true"
				:show-search-icon="false"
				:clearable="true"
				:max-visible="20"
				:empty-text="__('No results')"
				class="w-[160px]"
				@search="(q: string) => onLinkSearch(field, q)"
				@update:model-value="(val: string | undefined) => onFilterChange(field.fieldname, val || '')"
			/>

			<Select
				v-else-if="field.fieldtype === 'Select'"
				:model-value="(modelFilters[field.fieldname] as string) || '__all__'"
				@update:model-value="(val: string | undefined) => onFilterChange(field.fieldname, val || '')"
			>
				<SelectTriggerStyled class="h-8 w-[140px]">
					<SelectValue :placeholder="field.label || field.fieldname" />
				</SelectTriggerStyled>
				<SelectContentStyled>
					<SelectItemStyled value="__all__">{{ __("All") }} {{ field.label }}</SelectItemStyled>
					<SelectItemStyled v-for="opt in getSelectOptions(field)" :key="opt" :value="opt">
						{{ __(opt) }}
					</SelectItemStyled>
				</SelectContentStyled>
			</Select>

			<Select
				v-else-if="field.fieldtype === 'Check'"
				:model-value="(modelFilters[field.fieldname] as string) || '__all__'"
				@update:model-value="(val: string | undefined) => onFilterChange(field.fieldname, val || '')"
			>
				<SelectTriggerStyled class="h-8 w-[130px]">
					<SelectValue :placeholder="field.label || field.fieldname" />
				</SelectTriggerStyled>
				<SelectContentStyled>
					<SelectItemStyled value="__all__">{{ __("All") }} {{ field.label }}</SelectItemStyled>
					<SelectItemStyled value="1">{{ __("Yes") }}</SelectItemStyled>
					<SelectItemStyled value="0">{{ __("No") }}</SelectItemStyled>
				</SelectContentStyled>
			</Select>
			<Input
				v-else
				:model-value="(modelFilters[field.fieldname] as string) || ''"
				:placeholder="field.label || field.fieldname"
				class="h-8 w-[140px] text-sm"
				@change="
					(e: Event) => onTextFilterChange(field.fieldname, (e.target as HTMLInputElement).value)
				"
				@keydown.enter="
					(e: Event) => onTextFilterChange(field.fieldname, (e.target as HTMLInputElement).value)
				"
			/>
		</template>
	</div>
</template>

<script setup lang="ts">
import { reactive, computed } from "vue";
import { Autocomplete } from "@/components/ui/autocomplete";
import type { AutocompleteOption } from "@/components/ui/autocomplete";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectTriggerStyled,
	SelectContentStyled,
	SelectItemStyled,
	SelectValue,
} from "@/components/ui/select";
import type { DocField } from "@/services/doctypeMeta";
import { parseSelectOptions } from "@/services/doctypeMeta";
import { searchLink } from "@/services/api";
import __ from "@/lib/translate";

const ID_FIELD: DocField = {
	fieldname: "name",
	fieldtype: "Data",
	label: "ID",
	in_standard_filter: 1,
};

const props = defineProps<{
	fields: DocField[];
	modelFilters: Record<string, unknown>;
}>();

const emit = defineEmits<{
	(e: "update:modelFilters", filters: Record<string, unknown>): void;
}>();

const resolvedFields = computed<DocField[]>(() => {
	const hasName = props.fields.some((f) => f.fieldname === "name");
	return hasName ? props.fields : [ID_FIELD, ...props.fields];
});

const linkOptions = reactive<Record<string, AutocompleteOption[]>>({});

function getSelectOptions(field: DocField): string[] {
	return parseSelectOptions(field.options);
}

async function onLinkSearch(field: DocField, txt: string) {
	if (!field.options) {
		linkOptions[field.fieldname] = [];
		return;
	}
	try {
		const results = await searchLink(field.options, txt);
		linkOptions[field.fieldname] = results.map((r) => ({
			label: r.description ? `${r.value} — ${r.description}` : r.value,
			value: r.value,
			description: r.description,
		}));
	} catch {
		linkOptions[field.fieldname] = [];
	}
}

function onFilterChange(fieldname: string, value: string) {
	const updated = { ...props.modelFilters };
	if (!value || value === "__all__") {
		delete updated[fieldname];
	} else {
		updated[fieldname] = value;
	}
	emit("update:modelFilters", updated);
}

function onTextFilterChange(fieldname: string, value: string) {
	const updated = { ...props.modelFilters };
	if (!value.trim()) {
		delete updated[fieldname];
	} else {
		updated[fieldname] = value.trim();
	}
	emit("update:modelFilters", updated);
}
</script>
