import { Plugin } from "obsidian";
import { BetterPdfSettings, BetterPdfSettingsTab } from "./settings";
import * as pdfjs from "pdfjs-dist";
import * as worker from "pdfjs-dist/build/pdf.worker.entry.js";

interface PdfNodeParameters {
	range: Array<number>;
	url: string;
	link: boolean;
	page: number | Array<number | Array<number>>;
	scale: number;
	fit: boolean,
	rotation: number;
	rect: Array<number>;
}

export default class BetterPDFPlugin extends Plugin {
	settings: BetterPdfSettings;

	async onload() {
		console.log("Better PDF loading...");

		this.settings = Object.assign(new BetterPdfSettings(), await this.loadData());
		this.addSettingTab(new BetterPdfSettingsTab(this.app, this));

		pdfjs.GlobalWorkerOptions.workerSrc = worker;

		this.registerMarkdownCodeBlockProcessor("pdf", async (src, el) => {

			// Get Parameters
			let parameters: PdfNodeParameters = null;
			try {
				parameters = this.readParameters(src);
			} catch (e) {
				el.createEl("h2", { text: "PDF Parameters invalid: " + e.message });
			}

			//Create PDF Node
			if (parameters !== null) {
				try {

					//Read Document
					const arrayBuffer = await this.app.vault.adapter.readBinary(parameters.url);
					const buffer = Buffer.from(arrayBuffer);
					const document = await pdfjs.getDocument(buffer).promise;

					//Read pages
					for (const pageNumber of <number[]>parameters.page) {
						const page = await document.getPage(pageNumber);
						let host = el;

						// Create hyperlink for Page
						if (parameters.link) {
							const href = el.createEl("a");
							href.href = parameters.url + "#page=" + pageNumber;
							href.className = "internal-link";

							host = href;
						}

						// Get Viewport
						const offsetX = Math.floor(
							parameters.rect[0] * -1 * parameters.scale
						);
						const offsetY = Math.floor(
							parameters.rect[1] * -1 * parameters.scale
						);

						const viewport = page.getViewport({
							scale: parameters.scale,
							rotation: parameters.rotation,
							offsetX: offsetX,
							offsetY: offsetY,
						});

						// Render Canvas
						const canvas = host.createEl("canvas");
						if (parameters.fit) {
							canvas.style.width = "100%";
						}

						const context = canvas.getContext("2d");

						if (parameters.rect[2] < 1) {
							canvas.height = viewport.height;
							canvas.width = viewport.width;
						} else {
							canvas.height = Math.floor(parameters.rect[2] * parameters.scale);
							canvas.width = Math.floor(parameters.rect[3] * parameters.scale);
						}

						const renderContext = {
							canvasContext: context,
							viewport: viewport,
						};
						await page.render(renderContext);
					}
				} catch (error) {
					el.createEl("h2", { text: error });
				}
			}
		});
	}

	private readParameters(jsonString: string) {
		// "url" : [[file.pdf]] is an invalid json since it misses quotation marks in value
		if (jsonString.contains("[[") && !jsonString.contains('"[[')) {
			jsonString = jsonString.replace("[[", '"[[');
			jsonString = jsonString.replace("]]", ']]"');
		}

		const parameters: PdfNodeParameters = JSON.parse(jsonString);

		//Transform internal Link to external
		if (parameters.url.startsWith("[[")) {
			parameters.url = parameters.url.substr(2, parameters.url.length - 4);
			parameters.url = this.app.metadataCache.getFirstLinkpathDest(
				parameters.url,
				""
			).path;
		}

		if (parameters.link === undefined) {
			parameters.link = this.settings.link_by_default;
		}

		//Convert Range (if present) and Page to Array<Page>
		if (parameters.range !== undefined) {
			parameters.page = Array.from({ length: parameters.range[1] - parameters.range[0] + 1 }, (_, i) => parameters.range[0] + i);
		}

		if (typeof parameters.page === "number") {
			parameters.page = [parameters.page];
		}
		if (parameters.page === undefined) {
			parameters.page = [1];
		}

		// Flatten ranges
		for (let i = 0; i < parameters.page.length; i++) {
			if (Array.isArray(parameters.page[i])) {
				const range = parameters.page.splice(i, 1)[0] as Array<number>;
				for (let j = range[0]; j <= range[1]; j++) {
					parameters.page.splice(i, 0, j);
					i += 1;
				}
			}
		}

		if (
			parameters.scale === undefined ||
			parameters.scale < 0.1 ||
			parameters.scale > 10.0
		) {
			parameters.scale = 1.0;
		}

		if (parameters.fit === undefined) {
			parameters.fit = this.settings.fit_by_default;
		}

		if (parameters.rotation === undefined) {
			parameters.rotation = 0;
		}

		if (parameters.rect === undefined) {
			parameters.rect = [0, 0, 0, 0];
		}
		return parameters;
	}

	onunload() {
		console.log("unloading Better PDF plugin...");
	}
}
