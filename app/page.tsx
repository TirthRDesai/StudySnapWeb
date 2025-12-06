"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

type AuthMode = "login" | "signup";
type JobStatusType =
	| "pending"
	| "reading"
	| "flashcards"
	| "quizzes"
	| "completed"
	| "failed";

type JobEntry = {
	jobId: string;
	documentId: string;
	date: string;
	filename: string;
};
type QuizOptionsType = {
	A: string;
	B: string;
	C: string;
	D: string;
};

const bucketName = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "documents";

export default function Home() {
	const [mode, setMode] = useState<AuthMode>("login");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	const [authMessage, setAuthMessage] = useState<string | null>(null);
	const [authError, setAuthError] = useState<string | null>(null);
	const [isAuthenticating, setIsAuthenticating] = useState(false);

	const [currentUser, setCurrentUser] = useState<User | null>(null);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [uploadStatus, setUploadStatus] = useState<string | null>(null);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [isUploading, setIsUploading] = useState(false);

	const [jobs, setJobs] = useState<JobEntry[]>([]);
	const [shouldFetchJobs, setShouldFetchJobs] = useState<boolean>(false);

	const [apiNote, setApiNote] = useState<string | null>(null);
	const [apiError, setApiError] = useState<string | null>(null);
	const [apiLoading, setApiLoading] = useState(false);

	const [jobId, setJobId] = useState<string | null>(
		"60e7d89c-5fde-40b0-9674-4b30a7e255e8"
	);
	const [flashcardsData, setFlashcardsData] = useState<
		{ question: string; answer: string }[] | null
	>(null);
	const [quizzesData, setQuizzesData] = useState<
		| {
				question: string;
				options: QuizOptionsType;
				correct_answer: string;
				difficulty: "Easy" | "Medium" | "Hard";
		  }[]
		| null
	>(null);
	const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
	const [activeJobTab, setActiveJobTab] = useState<"flashcards" | "quizzes">(
		"flashcards"
	);
	const [contentLoading, setContentLoading] = useState(false);
	const [cardFlipState, setCardFlipState] = useState<Record<number, boolean>>(
		{}
	);
	const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
	const [quizScore, setQuizScore] = useState(0);
	const [flashcardIndex, setFlashcardIndex] = useState(0);

	useEffect(() => {
		const fetchJobs = async () => {
			const { data, error } = await supabase
				.from("jobs")
				.select("job_id, document_id")
				.eq("email", email);

			if (error || !data) {
				console.log("Error fetching jobs:", error);
				return;
			}

			const resolvedJobs = await Promise.all(
				data.map(async (content) => {
					const { data: docData, error: docError } = await supabase
						.from("documents")
						.select("file_name, created_at")
						.eq("id", content.document_id)
						.single();

					if (docError || !docData) {
						console.log("Error fetching documents:", docError);
						return null;
					}

					const formattedDate = new Date(
						docData.created_at
					).toLocaleDateString(undefined, {
						month: "short",
						day: "numeric",
						year: "numeric",
					});

					return {
						jobId: content.job_id,
						documentId: content.document_id,
						filename: docData.file_name,
						date: formattedDate,
					};
				})
			);

			setJobs(resolvedJobs.filter(Boolean) as JobEntry[]);
			setShouldFetchJobs(false);
		};

		if (shouldFetchJobs) fetchJobs();
	}, [shouldFetchJobs, email]);

	useEffect(() => {
		if (email) setShouldFetchJobs(true);
	}, [email]);

	useEffect(() => {
		if (currentUser && currentUser.email) setEmail(currentUser.email);
	}, [currentUser]);

	useEffect(() => {
		supabase.auth.getSession().then(({ data }) => {
			setCurrentUser(data.session?.user ?? null);
		});

		const { data: authListener } = supabase.auth.onAuthStateChange(
			(_, session) => {
				setCurrentUser(session?.user ?? null);
			}
		);

		return () => {
			authListener.subscription.unsubscribe();
		};
	}, []);

	const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setAuthMessage(null);
		setAuthError(null);
		setIsAuthenticating(true);

		if (!email || !password) {
			setAuthError("Email and password are required.");
			setIsAuthenticating(false);
			return;
		}

		if (mode === "signup" && !name.trim()) {
			setAuthError("Please add your name for sign up.");
			setIsAuthenticating(false);
			return;
		}

		try {
			if (mode === "signup") {
				const { data, error } = await supabase.auth.signUp({
					email,
					password,
					options: { data: { name } },
				});

				if (error) throw error;

				if (data.user) {
					await supabase.from("users").upsert({
						id: data.user.id,
						email,
						name,
						password,
						updated_at: new Date().toISOString(),
					});
				}

				setAuthMessage(
					"Account created! If email confirmation is enabled, please verify before signing in."
				);
				setMode("login");
			} else {
				const { data, error } = await supabase.auth.signInWithPassword({
					email,
					password,
				});

				if (error || !data.session) {
					throw (
						error ??
						new Error("Unable to sign in. Check your details.")
					);
				}

				setAuthMessage("Welcome back! You are signed in.");
			}
		} catch (error) {
			setAuthError(
				error instanceof Error
					? error.message
					: "Authentication failed."
			);
		} finally {
			setIsAuthenticating(false);
		}
	};

	const handleSignOut = async () => {
		await supabase.auth.signOut();
		setCurrentUser(null);
		setSelectedFile(null);
	};

	const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		setUploadError(null);
		setUploadStatus(null);
		if (file && file.type !== "application/pdf") {
			setUploadError("Only PDF files are allowed.");
			setSelectedFile(null);
			return;
		}
		setSelectedFile(file ?? null);
	};

	const handleUpload = async () => {
		setUploadError(null);
		setUploadStatus(null);

		if (!currentUser) {
			setUploadError("Please sign in before uploading.");
			return;
		}

		if (!selectedFile) {
			setUploadError("Choose a PDF to upload.");
			return;
		}

		setIsUploading(true);

		const emailFolder = currentUser.email ?? "anonymous";
		const sanitizedName = selectedFile.name.replace(/\s+/g, "-");
		const path = `${emailFolder}/${Date.now()}-${sanitizedName}`;

		try {
			const { error } = await supabase.storage
				.from(bucketName)
				.upload(path, selectedFile, {
					cacheControl: "3600",
					upsert: false,
					contentType: selectedFile.type || "application/pdf",
				});

			if (error) {
				console.log(error);
				throw error;
			}

			setUploadStatus(`Uploaded to ${bucketName}/${path}`);
			syncTableRecords(path);
			setSelectedFile(null);
		} catch (error) {
			console.log(error);

			setUploadError(
				error instanceof Error
					? error.message
					: "Upload failed. Try again."
			);
		} finally {
			setIsUploading(false);
		}
	};

	const syncTableRecords = async (path: string) => {
		setApiError(null);
		setApiNote(null);
		setApiLoading(true);

		try {
			const userId = currentUser?.id || "example-user-id";
			const response = await fetch("/api/table-update", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					userId,
					path,
				}),
			});

			if (!response.ok) {
				throw new Error(`API error: ${response.statusText}`);
			}

			const result = await response.json();
			if (result.error) {
				throw new Error(result.error);
			}

			setApiNote(result.message ?? "Synced file to tables.");
			setShouldFetchJobs(true);

			const fileId = result.fileId;

			startJob(userId, path, fileId);
		} catch (error) {
			setApiError(
				error instanceof Error
					? error.message
					: "Could not reach the API."
			);
		} finally {
			setApiLoading(false);
		}
	};

	const createLink = (
		base_url: string,
		...params: { name: string; value: string }[]
	): string => {
		let url = base_url;
		if (params.length === 0) return url;

		url +=
			"?" +
			params.map((param) => param.name + "=" + param.value).join("&");

		return url;
	};

	const startJob = async (userId: string, path: string, fileId: string) => {
		const SERVER_URL =
			process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8000";
		try {
			setApiLoading(true);
			const email = currentUser?.email || "anonymous@example.com";

			const body = [
				{ name: "email", value: email },
				{ name: "userId", value: userId },
			];
			const url = createLink(`${SERVER_URL}/process/` + fileId, ...body);

			const response = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});

			if (!response.ok) {
				throw new Error(`Job API error: ${response.statusText}`);
			}

			const result = await response.json();
			if (result.error) {
				throw new Error(result.error);
			}

			setJobId(result.jobId);
		} catch (error) {
			setApiError(
				error instanceof Error
					? error.message
					: "Could not start the job."
			);
		} finally {
			setApiLoading(false);
		}
	};

	const handleDeleteJob = async (targetJobId: string) => {
		try {
			const { data: jobRecord, error: jobError } = await supabase
				.from("jobs")
				.select("document_id")
				.eq("job_id", targetJobId)
				.single();

			if (jobError) throw jobError;

			const documentId = jobRecord?.document_id;
			let filePath: string | null = null;

			if (documentId) {
				const { data: document, error: documentError } = await supabase
					.from("documents")
					.select("file_path")
					.eq("id", documentId)
					.single();

				if (!documentError) {
					filePath = document?.file_path ?? null;
				} else {
					throw documentError;
				}
			}

			if (filePath) {
				const { error: storageError } = await supabase.storage
					.from(bucketName)
					.remove([filePath]);

				if (storageError) throw storageError;
			}

			if (documentId) {
				await supabase
					.from("document_files")
					.delete()
					.eq("document_id", documentId);
				await supabase.from("documents").delete().eq("id", documentId);
			}

			await supabase.from("jobs").delete().eq("job_id", targetJobId);

			setJobs((prev) => prev.filter((job) => job.jobId !== targetJobId));
			if (jobId === targetJobId) {
				setJobId(null);
				setFlashcardsData(null);
				setQuizzesData(null);
			}
			if (expandedJobId === targetJobId) {
				setExpandedJobId(null);
			}
			setShouldFetchJobs(true);
		} catch (error) {
			console.log("Error deleting job:", error);
		}
	};

	const loadStudyContent = async (job: JobEntry) => {
		try {
			setContentLoading(true);
			setFlashcardsData(null);
			setQuizzesData(null);
			setQuizAnswers({});
			setQuizScore(0);
			setCardFlipState({});
			setFlashcardIndex(0);

			const folder = currentUser?.email || email || "anonymous";
			const baseName = job.filename.replace(/\.[^/.]+$/, "");

			const flashcardsPath = `${folder}/flashcards_${baseName}.json`;
			const quizzesPath = `${folder}/quiz_${baseName}.json`;

			const [{ data: flashcardUrl }, { data: quizUrl }] =
				await Promise.all([
					supabase.storage
						.from("flashcards")
						.createSignedUrl(flashcardsPath, 60),
					supabase.storage
						.from("quizzes")
						.createSignedUrl(quizzesPath, 60),
				]);

			if (flashcardUrl?.signedUrl) {
				const resp = await fetch(flashcardUrl.signedUrl);
				if (resp.ok) {
					const data = (await resp.json()) as {
						question: string;
						answer: string;
					}[];
					setFlashcardsData(data);
				}
			}

			if (quizUrl?.signedUrl) {
				const resp = await fetch(quizUrl.signedUrl);
				if (resp.ok) {
					const data = (await resp.json()) as {
						question: string;
						options: QuizOptionsType;
						correct_answer: string;
						difficulty: "Easy" | "Medium" | "Hard";
					}[];
					setQuizzesData(data);
				}
			}
		} catch (error) {
			console.log("Error loading study content:", error);
		} finally {
			setContentLoading(false);
		}
	};

	const handleOpenPdf = async (documentId: string) => {
		try {
			const { data, error } = await supabase
				.from("documents")
				.select("file_path")
				.eq("id", documentId)
				.single();

			if (error || !data?.file_path) {
				console.log("Unable to fetch file path for document:", error);
				return;
			}

			const { data: signed, error: signedError } = await supabase.storage
				.from(bucketName)
				.createSignedUrl(data.file_path, 60);

			if (signedError || !signed?.signedUrl) {
				console.log("Unable to create signed URL:", signedError);
				return;
			}

			window.open(signed.signedUrl, "_blank");
		} catch (err) {
			console.log("Error opening pdf:", err);
		}
	};

	const handleRowClick = (job: JobEntry) => {
		const isSame = expandedJobId === job.jobId;
		setExpandedJobId(isSame ? null : job.jobId);
		if (!isSame) {
			setJobId(job.jobId);
			setActiveJobTab("flashcards");
			loadStudyContent(job);
		}
	};

	const handleFlashcardNav = (direction: "prev" | "next") => {
		if (!flashcardsData?.length) return;
		setCardFlipState({});
		setFlashcardIndex((prev) => {
			if (direction === "next") {
				return Math.min(prev + 1, flashcardsData.length - 1);
			}
			return Math.max(prev - 1, 0);
		});
	};

	const handleSelectQuizOption = (qIndex: number, option: string) => {
		setQuizAnswers((prev) => {
			const next = { ...prev, [qIndex]: option };
			if (quizzesData) {
				let score = 0;
				quizzesData.forEach((quiz, idx) => {
					if (next[idx] === quiz.correct_answer) {
						score += 1;
					}
				});
				setQuizScore(score);
			}
			return next;
		});
	};

	useEffect(() => {
		if (!jobId) return;

		const channel = supabase
			.channel("job-updates")
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "jobs",
					filter: `job_id=eq.${jobId}`,
				},
				(payload) => {
					const updatedJob = payload.new as {
						job_id: string;
						status: JobStatusType;
					};
					if (updatedJob.status === "completed") {
						setApiNote("Processing completed!");
						setShouldFetchJobs(true);
					} else if (updatedJob.status === "pending") {
						setApiNote("Job is pending...");
					} else if (updatedJob.status === "reading") {
						setApiNote("Reading the document...");
					} else if (updatedJob.status === "flashcards") {
						setApiNote("Generating flashcards...");
					} else if (updatedJob.status === "quizzes") {
						setApiNote("Creating quizzes...");
					} else if (updatedJob.status === "failed") {
						setApiError("Processing failed. Please try again.");
					}
				}
			)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [jobId]);

	useEffect(() => {
		if (flashcardsData && flashcardsData.length > 0)
			console.log(flashcardsData[0]);
	}, [flashcardsData]);

	return (
		<div className="relative min-h-screen bg-slate-950 text-white">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(93,63,211,0.25),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(16,185,129,0.2),transparent_25%)]" />
			<div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12 lg:px-10">
				<header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
							StudySnap
						</p>
						<h1 className="text-3xl font-semibold sm:text-4xl">
							Upload. Organize. Stay in flow.
						</h1>
						<p className="mt-2 max-w-2xl text-sm text-slate-200 sm:text-base">
							Sign up with Supabase auth, store PDFs per user
							email, and keep your database in sync automatically
							after each upload.
						</p>
					</div>
					{currentUser ? (
						<div className="flex items-center gap-3">
							<div className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs text-emerald-200">
								Signed in as {currentUser.email ?? "user"}
							</div>
							<button
								onClick={handleSignOut}
								className="rounded-full border border-white/20 px-3 py-2 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/5"
							>
								Sign out
							</button>
						</div>
					) : (
						<div className="rounded-full bg-white/10 px-3 py-2 text-xs font-medium text-slate-100">
							Awaiting sign in
						</div>
					)}
				</header>

				<div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
					<section className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-xl backdrop-blur">
						<div className="flex items-center justify-between">
							<h2 className="text-xl font-semibold">
								{mode === "login"
									? "Access your space"
									: "Create your account"}
							</h2>
							<div className="flex gap-2 rounded-full bg-white/5 p-1">
								{(["login", "signup"] as AuthMode[]).map(
									(item) => (
										<button
											key={item}
											onClick={() => setMode(item)}
											className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
												mode === item
													? "bg-white text-slate-900 shadow-sm"
													: "text-slate-200 hover:bg-white/10"
											}`}
										>
											{item === "login"
												? "Log in"
												: "Sign up"}
										</button>
									)
								)}
							</div>
						</div>

						<form
							onSubmit={handleAuth}
							className="mt-6 grid gap-4 md:grid-cols-2"
						>
							<label className="md:col-span-2">
								<span className="text-sm text-slate-200">
									Email
								</span>
								<input
									type="email"
									required
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none ring-emerald-400/50 transition focus:border-emerald-300/60 focus:ring-2"
									placeholder="you@studysnap.com"
								/>
							</label>

							{mode === "signup" && (
								<label>
									<span className="text-sm text-slate-200">
										Name
									</span>
									<input
										type="text"
										value={name}
										onChange={(e) =>
											setName(e.target.value)
										}
										className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none ring-emerald-400/50 transition focus:border-emerald-300/60 focus:ring-2"
										placeholder="Alex Quantum"
									/>
								</label>
							)}

							<label
								className={
									mode === "signup" ? "" : "md:col-span-2"
								}
							>
								<span className="text-sm text-slate-200">
									Password
								</span>
								<input
									type="password"
									required
									value={password}
									onChange={(e) =>
										setPassword(e.target.value)
									}
									className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm outline-none ring-emerald-400/50 transition focus:border-emerald-300/60 focus:ring-2"
									placeholder="********"
								/>
							</label>

							<div className="md:col-span-2 flex flex-col gap-3">
								<button
									type="submit"
									disabled={isAuthenticating}
									className="w-full rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-300 px-4 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-emerald-500/30 transition hover:from-emerald-300 hover:to-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
								>
									{isAuthenticating
										? "Working..."
										: mode === "login"
										? "Log in"
										: "Create account"}
								</button>

								{authMessage && (
									<p className="text-sm text-emerald-200">
										{authMessage}
									</p>
								)}
								{authError && (
									<p className="text-sm text-rose-200">
										{authError}
									</p>
								)}
							</div>
						</form>
					</section>

					<aside className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-6 shadow-xl backdrop-blur">
						<div className="flex items-center justify-between">
							<h3 className="text-lg font-semibold">
								Why StudySnap?
							</h3>
							<span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-200">
								Realtime-ready
							</span>
						</div>
						<ul className="mt-6 space-y-4 text-sm text-slate-100">
							<li className="flex items-start gap-3">
								<span className="mt-1 h-2 w-2 rounded-full bg-emerald-300" />
								<div>
									<p className="font-semibold">
										Supabase-native auth
									</p>
									<p className="text-slate-200/80">
										Email/password with immediate user table
										sync so you own the profile data.
									</p>
								</div>
							</li>
							<li className="flex items-start gap-3">
								<span className="mt-1 h-2 w-2 rounded-full bg-cyan-300" />
								<div>
									<p className="font-semibold">
										Organized storage
									</p>
									<p className="text-slate-200/80">
										PDFs saved into{" "}
										<code className="font-mono">
											email/
										</code>{" "}
										folders inside{" "}
										<code className="font-mono">
											{bucketName}
										</code>
										.
									</p>
								</div>
							</li>
							<li className="flex items-start gap-3">
								<span className="mt-1 h-2 w-2 rounded-full bg-indigo-300" />
								<div>
									<p className="font-semibold">
										Instant DB sync
									</p>
									<p className="text-slate-200/80">
										Uploads trigger a server route that logs
										every file in your Supabase tables.
									</p>
								</div>
							</li>
						</ul>
						<div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-100">
							Pro tip: set{" "}
							<code className="font-mono">
								NEXT_PUBLIC_SUPABASE_URL
							</code>
							,{" "}
							<code className="font-mono">
								NEXT_PUBLIC_SUPABASE_ANON_KEY
							</code>
							, and{" "}
							<code className="font-mono">
								NEXT_PUBLIC_SUPABASE_BUCKET
							</code>{" "}
							in
							<code className="font-mono"> .env</code>.
						</div>
					</aside>
				</div>

				<div className="grid gap-6">
					<section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur">
						<div className="flex items-center justify-between">
							<div>
								<h3 className="text-lg font-semibold">
									Upload your PDFs
								</h3>
								<p className="text-sm text-slate-200/80">
									Files go to the Supabase bucket and get
									logged to your tables under your email
									folder.
								</p>
							</div>
							<span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-100">
								{bucketName}
							</span>
						</div>

						<div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
							<label className="flex h-full cursor-pointer flex-col justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-slate-900/50 p-4 text-sm text-slate-200 transition hover:border-emerald-300/60 hover:bg-slate-900/70 md:col-span-1">
								<span className="text-xs uppercase tracking-[0.2em] text-slate-300">
									Drop PDF
								</span>
								<span className="text-sm font-semibold">
									{selectedFile
										? selectedFile.name
										: "Choose a PDF to upload"}
								</span>
								<input
									type="file"
									accept="application/pdf"
									onChange={handleFileChange}
									className="hidden"
								/>
							</label>

							<button
								onClick={handleUpload}
								disabled={isUploading || !currentUser}
								className="h-full rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-300 px-4 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-emerald-500/30 transition hover:from-emerald-300 hover:to-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{currentUser
									? isUploading
										? "Uploading..."
										: "Upload now"
									: "Sign in to upload"}
							</button>
						</div>

						{(uploadStatus ||
							uploadError ||
							apiNote ||
							apiError ||
							apiLoading) && (
							<div className="mt-4 space-y-2 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm">
								<p className="text-xs uppercase tracking-[0.25em] text-slate-400">
									Upload feed
								</p>
								{uploadError && (
									<p className="text-rose-200">
										{uploadError}
									</p>
								)}
								{apiError && (
									<p className="text-rose-200">{apiError}</p>
								)}
								{uploadStatus && (
									<p className="text-emerald-200">
										{uploadStatus}
									</p>
								)}
								{apiLoading && (
									<p className="text-slate-200">
										Syncing table entries...
									</p>
								)}
								{apiNote && (
									<p className="text-emerald-200">
										{apiNote}
									</p>
								)}
							</div>
						)}
					</section>

					<section className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 shadow-xl backdrop-blur">
						<div className="flex items-center justify-between">
							<div>
								<h3 className="text-lg font-semibold">
									Your documents
								</h3>
								<p className="text-sm text-slate-200/80">
									Uploaded files linked to your account.
								</p>
							</div>
							<span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-100">
								{jobs.length} files
							</span>
						</div>

						<div className="mt-4 rounded-2xl border border-white/10 bg-black/30">
							<div className="grid grid-cols-[70px_1fr_160px_130px] items-center gap-2 border-b border-white/5 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
								<span>Sr. No</span>
								<span>Filename</span>
								<span className="text-right">Date</span>
								<span className="text-right">Actions</span>
							</div>

							{jobs.length === 0 ? (
								<div className="px-4 py-5 text-sm text-slate-200">
									No files yet. Upload a PDF to see it here.
								</div>
							) : (
								<ul className="divide-y divide-white/5">
									{jobs.map((job, index) => (
										<li
											key={job.jobId}
											className="px-4 py-3 text-sm text-slate-100 transition"
										>
											<div
												className="grid grid-cols-[70px_1fr_160px_130px] items-center gap-2 cursor-pointer rounded-xl px-2 py-3 hover:bg-white/5 active:scale-[0.995]"
												onClick={() =>
													handleRowClick(job)
												}
											>
												<span className="text-slate-300">
													{index + 1}
												</span>
												<span className="truncate">
													{job.filename}
												</span>
												<span className="text-right text-slate-200/80">
													{job.date}
												</span>
												<div className="flex justify-end gap-2">
													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															handleOpenPdf(
																job.documentId
															);
														}}
														className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold text-slate-100 transition hover:border-emerald-300/60 hover:text-emerald-200 cursor-pointer"
													>
														PDF
													</button>
													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															handleDeleteJob(
																job.jobId
															);
														}}
														className="flex items-center gap-1 rounded-md border border-white/10 bg-rose-500/15 px-2 py-1 text-xs font-semibold text-rose-100 transition hover:border-rose-300/60 hover:bg-rose-500/25 cursor-pointer"
													>
														Delete
													</button>
												</div>
											</div>

											{expandedJobId === job.jobId && (
												<div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4">
													<div className="flex flex-wrap items-center justify-between gap-3">
														<div className="flex gap-2">
															<button
																type="button"
																onClick={() =>
																	setActiveJobTab(
																		"flashcards"
																	)
																}
																className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
																	activeJobTab ===
																	"flashcards"
																		? "bg-emerald-400 text-slate-900 shadow-sm"
																		: "bg-white/10 text-slate-100 hover:bg-white/20"
																}`}
															>
																Flashcards
															</button>
															<button
																type="button"
																onClick={() =>
																	setActiveJobTab(
																		"quizzes"
																	)
																}
																className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
																	activeJobTab ===
																	"quizzes"
																		? "bg-emerald-400 text-slate-900 shadow-sm"
																		: "bg-white/10 text-slate-100 hover:bg-white/20"
																}`}
															>
																Quizzes
															</button>
														</div>
														<div className="text-xs text-slate-200">
															{contentLoading
																? "Loading study content..."
																: activeJobTab ===
																  "quizzes"
																? `Score: ${quizScore}/${
																		quizzesData?.length ??
																		0
																  }`
																: "Tap a card to flip"}
														</div>
													</div>

													<div className="mt-4">
														{contentLoading && (
															<p className="text-sm text-slate-200">
																Fetching files
																from storage...
															</p>
														)}

														{!contentLoading &&
															activeJobTab ===
																"flashcards" && (
																<div className="space-y-3">
																	{flashcardsData &&
																	flashcardsData.length >
																		0 ? (
																		<>
																			{(() => {
																				const card =
																					flashcardsData[
																						flashcardIndex
																					];
																				const isFlipped =
																					cardFlipState[
																						flashcardIndex
																					] ??
																					false;
																				return (
																					<div
																						onClick={() =>
																							setCardFlipState(
																								(
																									prev
																								) => ({
																									...prev,
																									[flashcardIndex]:
																										!prev[
																											flashcardIndex
																										],
																								})
																							)
																						}
																						className="group relative h-48 cursor-pointer rounded-xl bg-gradient-to-br from-indigo-500/25 via-sky-500/20 to-emerald-400/20 p-[1px]"
																						style={{
																							perspective:
																								"1200px",
																						}}
																					>
																						<div
																							className="relative h-full w-full overflow-hidden rounded-[11px] bg-slate-950/85 p-5 text-left transition-transform duration-1000 [transform-style:preserve-3d]"
																							style={{
																								transform:
																									isFlipped
																										? "rotateY(180deg)"
																										: "rotateY(0deg)",
																							}}
																						>
																							<div
																								className="absolute inset-0 flex h-full w-full flex-col justify-center backface-hidden py-4 duration-1000"
																								style={{
																									backfaceVisibility:
																										"hidden",
																									opacity:
																										isFlipped
																											? 0
																											: 1,
																								}}
																							>
																								<div className="flex items-center justify-center text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200 h-fit">
																									Question
																								</div>
																								<p className="text-base font-semibold leading-5 text-white h-full flex items-center justify-center">
																									{
																										card.question
																									}
																								</p>
																							</div>
																							<div
																								className="absolute inset-0 flex h-full w-full flex-col justify-center rounded-[11px]  p-5 text-emerald-200 backface-hidden duration-1000"
																								style={{
																									backfaceVisibility:
																										"hidden",
																									opacity:
																										isFlipped
																											? 1
																											: 0,
																									transitionDuration:
																										"1s",
																								}}
																							>
																								<div className="flex items-center justify-center text-xs font-semibold uppercase tracking-[0.2em] transform-[rotateY(180deg)] h-fit">
																									Answer
																								</div>
																								<p className="text-base leading-5 text-white transform-[rotateY(180deg)] h-full flex items-center justify-center">
																									{
																										card.answer
																									}
																								</p>
																							</div>

																							{/* <div
																								className="absolute inset-0 flex h-full w-full flex-col justify-center backface-hidden py-4"
																								style={{
																									backfaceVisibility:
																										"hidden",
																									opacity:
																										isFlipped
																											? 1
																											: 0,
																								}}
																							>
																								<div className="flex items-center justify-center text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200 h-fit transform-[rotateY(180deg)]">
																									Answer
																								</div>
																								<p className="text-base font-semibold leading-5 text-white h-full flex items-center justify-center transform-[rotateY(180deg)]">
																									{
																										card.answer
																									}
																								</p>
																							</div> */}
																						</div>
																					</div>
																				);
																			})()}
																			<div className="flex items-center justify-center gap-3 text-xs text-slate-200">
																				<button
																					type="button"
																					disabled={
																						flashcardIndex ===
																						0
																					}
																					onClick={() =>
																						handleFlashcardNav(
																							"prev"
																						)
																					}
																					className="cursor-pointer rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-100 transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
																				>
																					&lt;
																				</button>
																				<span className="text-slate-100">
																					{flashcardIndex +
																						1}{" "}
																					/{" "}
																					{
																						flashcardsData.length
																					}
																				</span>
																				<button
																					type="button"
																					disabled={
																						flashcardIndex ===
																						flashcardsData.length -
																							1
																					}
																					onClick={() =>
																						handleFlashcardNav(
																							"next"
																						)
																					}
																					className="cursor-pointer rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-100 transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
																				>
																					&gt;
																				</button>
																			</div>
																		</>
																	) : (
																		<p className="text-sm text-slate-300">
																			No
																			flashcards
																			found
																			for
																			this
																			file.
																		</p>
																	)}
																</div>
															)}

														{!contentLoading &&
															activeJobTab ===
																"quizzes" && (
																<div className="space-y-3">
																	{quizzesData &&
																	quizzesData.length >
																		0 ? (
																		quizzesData.map(
																			(
																				quiz,
																				qIndex
																			) => {
																				const selectedOption =
																					quizAnswers[
																						qIndex
																					];
																				return (
																					<div
																						key={
																							qIndex
																						}
																						className="rounded-xl border border-white/10 bg-slate-900/70 p-4"
																					>
																						<div className="flex items-start justify-between gap-3">
																							<p className="font-semibold text-white">
																								{
																									quiz.question
																								}
																							</p>
																							<span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase text-slate-200">
																								{
																									quiz.difficulty
																								}
																							</span>
																						</div>
																						<div className="mt-3 grid gap-2 sm:grid-cols-2">
																							{Object.entries(
																								quiz.options
																							).map(
																								([
																									key,
																									option,
																								]) => {
																									const isSelected =
																										selectedOption ===
																										key; // now comparing by key (A/B/C/D)
																									const isCorrect =
																										key ===
																										quiz.correct_answer; // correct answer is also a key

																									return (
																										<button
																											key={
																												key
																											}
																											type="button"
																											onClick={() =>
																												handleSelectQuizOption(
																													qIndex,
																													key
																												)
																											}
																											className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
																												isSelected
																													? isCorrect
																														? "border-emerald-300 bg-emerald-500/20 text-emerald-50"
																														: "border-rose-300 bg-rose-500/20 text-rose-50"
																													: "border-white/10 bg-white/5 text-slate-100 hover:border-white/20"
																											}`}
																										>
																											<span className="font-semibold mr-2">
																												{
																													key
																												}

																												.
																											</span>{" "}
																											{
																												option
																											}
																										</button>
																									);
																								}
																							)}
																						</div>
																					</div>
																				);
																			}
																		)
																	) : (
																		<p className="text-sm text-slate-300">
																			No
																			quizzes
																			found
																			for
																			this
																			file.
																		</p>
																	)}
																</div>
															)}
													</div>
												</div>
											)}
										</li>
									))}
								</ul>
							)}
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
