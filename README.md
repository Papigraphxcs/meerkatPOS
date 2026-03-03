# X POS

**X POS** is a modern, feature-rich Point of Sale application built on top of [Frappe](https://frappeframework.com) and [ERPNext](https://erpnext.com). It provides a fast, intuitive, and fully offline-capable POS experience designed for retail and restaurant businesses.

---

## Key Features

- **Modern Interface** – Clean, responsive Vue.js frontend optimised for touchscreens, tablets, and desktop.
- **Offline Mode** – Continues operating without an internet connection; syncs orders and payments automatically when back online.
- **ERPNext Integration** – Deeply integrated with ERPNext Sales Invoice, POS Profile, and Payment methods.
- **Multi-Payment Support** – Accept cash, card, and custom payment modes in a single transaction.
- **Order Management** – Create, hold, retrieve, and manage multiple open orders simultaneously.
- **Product Search & Variants** – Fast item lookup with barcode scanning support and variant selection.
- **Discount & Pricing** – Apply item-level and order-level discounts, price lists, and customer-specific pricing.
- **Customer Management** – Select existing customers or create new ones directly from the POS screen.
- **Receipts & Printing** – Generate print-ready receipts and invoices from within the POS interface.
- **Role-Based Access** – Controlled via standard Frappe/ERPNext user roles and POS Profile settings.

---

## Requirements

- Python >= 3.10
- Frappe Framework v15
- ERPNext v15

---

## Installation

Install via the [bench](https://github.com/frappe/bench) CLI:

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app https://github.com/alirazacodes/xpos --branch main
bench --site your-site.com install-app xpos
```

Then open your site and navigate to **X POS** from the home screen.

---

## Configuration

1. Create or update a **POS Profile** in ERPNext and assign it to the relevant users.
2. Set the default warehouse, payment methods, and print format on the POS Profile.
3. Open **X POS** from the app launcher to start selling.

---

## Contributing

This app uses `pre-commit` for code formatting and linting. Please [install pre-commit](https://pre-commit.com/#installation) and enable it for this repository:

```bash
cd apps/xpos
pre-commit install
```

The following tools are configured via pre-commit:

- **ruff** – Python linting and formatting
- **eslint** – JavaScript / TypeScript linting
- **prettier** – Code formatting
- **pyupgrade** – Automatic Python upgrade syntax

---

## License

MIT – see [license.txt](license.txt) for full terms.

---

## Author

Developed and maintained by **Ali Raza** – [ar.frappe.dev@gmail.com](mailto:ar.frappe.dev@gmail.com)
