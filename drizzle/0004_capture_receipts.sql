CREATE TABLE `capture_receipts` (
	`capture_id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`result` text NOT NULL,
	FOREIGN KEY (`capture_id`) REFERENCES `motifs`(`id`) ON UPDATE no action ON DELETE cascade
);
