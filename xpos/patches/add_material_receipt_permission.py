import frappe

from xpos.api.auth import clear_role_permission_cache
from xpos.install import DEFAULT_ROLES, seed_pos_permissions

NEW_PERMISSIONS = ("material_receipt",)


def execute():
	"""Backfill the material-receipt (add new stock) permission onto POS Roles that already exist."""
	seed_pos_permissions()

	defaults = dict(DEFAULT_ROLES)

	for role_name in frappe.get_all("POS Role", pluck="name"):
		role = frappe.get_doc("POS Role", role_name)
		present = {row.permission for row in role.permissions}
		missing = [key for key in NEW_PERMISSIONS if key not in present]
		if not missing:
			continue

		enabled_set = defaults.get(role_name, set())
		for permission_name in missing:
			role.append(
				"permissions",
				{
					"permission": permission_name,
					"enabled": 1 if permission_name in enabled_set else 0,
				},
			)
		role.save(ignore_permissions=True)

	clear_role_permission_cache()
