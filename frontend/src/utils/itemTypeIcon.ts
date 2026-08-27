import {
	Package,
	Wrench,
	Droplets,
	FlaskConical,
	Layers,
	Puzzle,
	Cpu,
	Coffee,
	UtensilsCrossed,
	Shirt,
	PenTool,
	Armchair,
	Hammer,
	Sparkles,
	Pill,
	HeartPulse,
	BookOpen,
	Boxes,
	Milk,
	Carrot,
	Beef,
	Fish,
	ShoppingBag,
	Gem,
	Paintbrush,
	Scissors,
	Stethoscope,
	Syringe,
	TestTube,
	Recycle,
	Battery,
	Plug,
	Lamp,
	Monitor,
	Smartphone,
	Watch,
	Gift,
	Wine,
	Candy,
} from "lucide-vue-next";
import type { Component } from "vue";

interface ItemTypeIconInput {
	item_group?: string;
	is_stock_item?: boolean | number;
}

interface IconRule {
	keywords: string[];
	icon: Component;
}

// Ordered by specificity: first keyword match wins.
const RULES: IconRule[] = [
	{ keywords: ["consumable"], icon: Droplets },
	{ keywords: ["raw material"], icon: Layers },
	{ keywords: ["sub assembl"], icon: Puzzle },
	{ keywords: ["service"], icon: Wrench },
	{ keywords: ["electronic", "gadget", "device"], icon: Cpu },
	{ keywords: ["phone", "mobile"], icon: Smartphone },
	{ keywords: ["computer", "laptop"], icon: Monitor },
	{ keywords: ["watch"], icon: Watch },
	{ keywords: ["battery", "power bank"], icon: Battery },
	{ keywords: ["cable", "charger", "electrical"], icon: Plug },
	{ keywords: ["light", "lamp", "lighting"], icon: Lamp },
	{ keywords: ["wine", "liquor", "alcohol", "spirits"], icon: Wine },
	{ keywords: ["dairy", "milk"], icon: Milk },
	{ keywords: ["meat", "beef", "poultry"], icon: Beef },
	{ keywords: ["seafood", "fish"], icon: Fish },
	{ keywords: ["vegetable", "produce", "fruit"], icon: Carrot },
	{ keywords: ["snack", "candy", "confection"], icon: Candy },
	{ keywords: ["beverage", "drink"], icon: Coffee },
	{ keywords: ["grocery", "food"], icon: UtensilsCrossed },
	{ keywords: ["apparel", "clothing", "fashion", "garment"], icon: Shirt },
	{ keywords: ["accessor", "bag"], icon: ShoppingBag },
	{ keywords: ["jewel", "gem"], icon: Gem },
	{ keywords: ["cosmetic", "beauty", "makeup"], icon: Sparkles },
	{ keywords: ["pharma", "medicine", "drug"], icon: Pill },
	{ keywords: ["injection", "vaccine"], icon: Syringe },
	{ keywords: ["health", "medical", "clinical"], icon: Stethoscope },
	{ keywords: ["lab", "chemical", "reagent"], icon: FlaskConical },
	{ keywords: ["test kit", "diagnostic"], icon: TestTube },
	{ keywords: ["furniture"], icon: Armchair },
	{ keywords: ["tool", "hardware"], icon: Hammer },
	{ keywords: ["stationery", "office", "paper"], icon: PenTool },
	{ keywords: ["paint", "art", "craft"], icon: Paintbrush },
	{ keywords: ["salon", "barber", "hair"], icon: Scissors },
	{ keywords: ["book", "media", "publication"], icon: BookOpen },
	{ keywords: ["gift"], icon: Gift },
	{ keywords: ["recycl", "waste"], icon: Recycle },
	{ keywords: ["assembl", "kit", "bundle"], icon: Boxes },
];

/** Picks a distinct icon for an item based on its item group, falling back to
 * a service wrench for non-stock items and a generic package otherwise. */
export function getItemTypeIcon(item: ItemTypeIconInput): Component {
	const group = (item.item_group || "").toLowerCase();
	if (group) {
		for (const rule of RULES) {
			if (rule.keywords.some((kw) => group.includes(kw))) {
				return rule.icon;
			}
		}
	}
	if (Number(item.is_stock_item) === 0) {
		return Wrench;
	}
	return Package;
}
