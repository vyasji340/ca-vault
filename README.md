# CA Vault V12

Personal banking current-affairs revision app.

## V12 updates
- 1,423 original CA entries preserved.
- 141 source-derived GA BAG entries added directly to `data.js` (Class 1 + Class 2).
- GA BAG section now works without storing the large source PDFs in GitHub/Vercel.
- `GA_BAG_MIX.xlsx` included as a small Excel backup/import file.
- Excel/CSV Import supports multiple sheets.
- Excel Export supports My Data and All CA backups.
- Duplicate title + category + date rows are skipped during import.
- Edit/Delete for manually added CA remains available.
- Memory Tree remains available for entity-based revision.
- Existing localStorage keys and Supabase tables are unchanged; no new SQL is required.

## Future CA file workflow
If you receive a new Excel/CSV: open **📥 Excel Tools → Import File**.
If you receive a PDF: convert/extract it to Excel first, then import the Excel. For a future GA BAG PDF you can send the PDF here and it can be converted into the same import-ready format.

## Supabase
Keep your existing `config.js` values. Do not commit a service-role/secret key.
