<template>
    <Dialog :open="open" @update:open="(val: boolean) => { if (!val) $emit('close') }">
        <DialogContent class="max-w-md">
            <DialogHeader>
                <DialogTitle class="flex items-center gap-3">
                    <img :src="isDark ? LogoDark : LogoLight" alt="X POS Logo" class="w-10 h-10" />
                    <span>{{ __("X POS") }}</span>
                </DialogTitle>
            </DialogHeader>

            <div class="space-y-4">
                <div class="text-center py-4">
                    <p class="text-lg font-semibold text-foreground">{{ __("X POS Desktop") }}</p>
                    <p class="text-sm text-muted-foreground">{{ __("Point of Sale Application for ERPNext") }}</p>
                </div>

                <div class="space-y-2 text-sm">
                    <div class="flex justify-between py-2 border-b border-border">
                        <span class="text-muted-foreground">{{ __("Version") }}</span>
                        <span class="font-medium">{{ version }}</span>
                    </div>
                    <div v-if="platformInfo" class="flex justify-between py-2 border-b border-border">
                        <span class="text-muted-foreground">{{ __("Platform") }}</span>
                        <span class="font-medium">{{ platformInfo.platform }} ({{ platformInfo.arch }})</span>
                    </div>
                    <div class="flex justify-between py-2 border-b border-border">
                        <span class="text-muted-foreground">{{ __("Mode") }}</span>
                        <span class="font-medium">{{ isElectronEnv ? __("Desktop App") : __("Web Browser") }}</span>
                    </div>
                    <div v-if="nodeRole" class="flex justify-between py-2 border-b border-border">
                        <span class="text-muted-foreground">{{ __("Node Role") }}</span>
                        <Badge :variant="nodeRole === 'hub' ? 'default' : 'secondary'">
                            {{ nodeRole === 'hub' ? __('Hub') : __('Till') }}
                        </Badge>
                    </div>
                    <div class="flex justify-between py-2">
                        <span class="text-muted-foreground">{{ __("Company") }}</span>
                        <span class="font-medium">{{ companyName || __("Not Set") }}</span>
                    </div>
                </div>

                <div class="pt-4 text-center text-xs text-muted-foreground">
                    <p>&copy; {{ currentYear }} {{ __("X POS Team") }}</p>
                    <p class="mt-1">{{ __("Built with Vue.js, Electron, and ERPNext") }}</p>
                </div>
            </div>

            <DialogFooter>
                <Button variant="outline" @click="$emit('close')">
                    {{ __("Close") }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>

<script setup lang="ts">
import { ref, inject, onMounted, type Ref } from "vue";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isElectron } from "@/services/electronBridge";
import { usePosStore } from "@/stores/posStore";
import { __ } from "@/lib/translate";

import LogoDark from "@/assets/images/xpos-logo-dark.svg";
import LogoLight from "@/assets/images/xpos-logo-light.svg";

defineProps<{
    open: boolean;
}>();

defineEmits<{
    close: [];
}>();

const isDark = inject<Ref<boolean>>("isDark")!;
const posStore = usePosStore();
const isElectronEnv = isElectron();

const version = ref("0.0.1");
const platformInfo = ref<{ platform: string; arch: string } | null>(null);
const nodeRole = ref<string | null>(null);
const currentYear = new Date().getFullYear();

const companyName = posStore.companyName;

onMounted(async () => {
    if (isElectronEnv && window.electronAPI) {
        try {
            const info = await window.electronAPI.getPlatformInfo();
            version.value = info.version;
            platformInfo.value = { platform: info.platform, arch: info.arch };

            if (window.electronAPI.node?.getRole) {
                nodeRole.value = await window.electronAPI.node.getRole();
            }
        } catch (e) {
            console.warn("Could not get platform info:", e);
        }
    }
});
</script>
