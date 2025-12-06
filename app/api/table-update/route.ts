import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
	process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
	throw new Error(
		"Supabase service credentials are missing for table update operations."
	);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
	auth: {
		autoRefreshToken: false,
		persistSession: false,
	},
});

export async function POST(request: Request) {
	try {
		const payload = await request.json();

		const { userId, path } = payload;
		if (!userId || !path) {
			return NextResponse.json(
				{ error: "Missing required fields: userId or path." },
				{ status: 400 }
			);
		}

		const filename = path.split("/").pop();
		if (!filename) {
			return NextResponse.json(
				{ error: "Invalid path format." },
				{ status: 400 }
			);
		}

		const { data: documentData, error: documentError } = await supabaseAdmin
			.from("documents")
			.insert({
				user_id: userId,
				file_name: filename,
				file_path: path,
			})
			.select();

		if (documentError) {
			return NextResponse.json(
				{
					error: `Failed to insert document record: ${documentError.message}`,
				},
				{ status: 500 }
			);
		}

		const documentId = documentData?.[0]?.id;
		if (!documentId) {
			return NextResponse.json(
				{ error: "Failed to retrieve document ID after insertion." },
				{ status: 500 }
			);
		}

		// TODO: Add record to the "public.document_files" table. document_id = documentId, storage_key = path

		const { data: fileData, error: fileError } = await supabaseAdmin
			.from("document_files")
			.insert({
				document_id: documentId,
				storage_key: path,
				original_name: filename,
			})
			.select();

		if (fileError) {
			return NextResponse.json(
				{
					error: `Failed to insert document file record: ${fileError.message}`,
				},
				{ status: 500 }
			);
		}

		if (!fileData || fileData.length === 0) {
			return NextResponse.json(
				{
					error: "Failed to retrieve document file ID after insertion.",
				},
				{ status: 500 }
			);
		}

		return NextResponse.json({
			ok: true,
			message: "Table update successful.",
			documentId: documentId,
			fileId: fileData[0].id,
		});
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to process the table update template.",
			},
			{ status: 500 }
		);
	}
}
