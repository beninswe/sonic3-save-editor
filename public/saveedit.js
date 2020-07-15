"use strict";

/*
 * constants
 */

// total size of save file
const CONSOLE_SIZE = 512;
const PC_SIZE      = 1024;
const STEAM_SIZE   = 163888;
const AIR_SIZE     = 398;

// file names and locations
const DEFAULT_SAVE_FILE = "saves/defaults.srm";
const S3_SAVE_NAME      = "sonic3.srm";
const S3K_SAVE_NAME     = "s3&k.srm";
const PC_SAVE_NAME      = "sonic3k.bin";
const STEAM_SAVE_NAME   = "bs.sav";
const AIR_SAVE_NAME     = "persistentdata.bin";
const MIME_TYPE = "application/x-sonic3-save-file";
const STORAGE_NAME = "sonic3";
const HEX_VIEW_WIDTH = 16;

// single-player for Sonic 3
const S3_SECTION_LENGTH = 52;
const S3_SLOT_LENGTH    = 8;
const S3_SLOTS    = 6;
const S3_START1   = 0x0b4;
const S3_START2   = 0x0fa;
const S3_START_PC = 0x0c0;

// single-player for S3&K
const S3K_SECTION_LENGTH = 84;
const S3K_SLOT_LENGTH    = 10;
const S3K_SLOTS    = 8;
const S3K_START1   = 0x140;
const S3K_START2   = 0x196;
const S3K_START_PC = 0x180;

// competition mode
const CP_SECTION_LENGTH = 84;
const CP_SLOT_LENGTH    = 4;
const CP_STAGES   = 5;
const CP_RANKINGS = 3;
const CP_START1   = 0x008;
const CP_START2   = 0x05e;
const CP_START_PC = 0x000;

// AIR format
const AIR_IDENTIFIER = "OXY.PDATA\x00\x01";
const AIR_START = 0x013;
const AIR_PREFIX = "SRAM_";
const AIR_SECTION_SP = "SRAM_SaveslotsP";
const AIR_SECTION_CP = "SRAM_SaveslotsExt";

// characters
const NOBODY = -1;
const SONIC_TAILS = 0;
const SONIC = 1;
const TAILS = 2;
const KNUCKLES = 3;
const KNUCKLES_TAILS = 4; // for Sonic 3 AIR

// game mechanics
const NEW = 0x80, CLEAR = 0x01, CHAOS_CLEAR = 0x02, SUPER_CLEAR = 0x03;
const S3_LAST_ZONE = 0x05;
const SONIC_LAST_ZONE = 0x0d, TAILS_LAST_ZONE = 0x0c, KNUCKLES_LAST_ZONE = 0x0b;
const EMERALDS = 7;

// save format
const CONSOLE = 0, PC = 1, STEAM = 2, AIR = 3;
const S3 = false, S3K = true;
const BYTE = false, WORD = true;
const LITTLE_ENDIAN = false, BIG_ENDIAN = true;

/*
 * initialization
 */

window.addEventListener("load", function() {
	const editor = new Editor();
	const store = new Storage(STORAGE_NAME);

	load(function(buffer) {
		const defaults = new Save();
		defaults.loadFromBuffer(buffer);
		editor.loadDefaults(defaults);

		let mem = store.load();
		let save = new Save();

		try {
			if (mem != null) { // restores from local storage if set
				if (Array.isArray(mem)) { // old format
					save.loadFromArray(mem);
				} else { // new format
					save.loadFromObject(mem);
				}

				editor.open(save);
			} else { // otherwise uses defaults
				editor.restoreDefaults();
			}
		} catch (err) {
			store.reset();
			displayError(err);
		}
	});

	editor.toggleOptions();

	window.addEventListener("beforeunload", function() {
		store.save(editor.saveToStorage());
	});
	window.addEventListener("keyup", function(event) {
		let key = event.keyCode;

		if (key == 27) { // Esc
			for (let element of $$(".overlay")) {
				element.classList.remove("open");
			}
		}

		if (key == 192) { // grave
			editor.toggleHexView();
		}
	});

	// load
	$("#file").addEventListener("change", function(event) {
		let file = event.target.files[0];

		if (file != null) {
			let reader = new FileReader();
			reader.addEventListener("load", function(event) {
				try {
					let save = new Save();
					save.loadFromBuffer(event.target.result);
					editor.open(save);
				} catch (err) {
					displayError(err);
				}
			});
			reader.readAsArrayBuffer(file);
		}
	});
	// save
	$("#download").addEventListener("click", function() {
		let filename = "", blob = null;

		try {
			[filename, blob] = editor.saveToFile();

			let a = $("#link");
			a.download = filename;
			a.href = window.URL.createObjectURL(blob);
			a.click();
			window.URL.revokeObjectURL(blob);
		} catch (err) {
			displayError(err);
		}
	});
	$("#reset").addEventListener("click", function() {
		editor.restoreDefaults();
	});

	for (let element of $$(".game")) {
		element.addEventListener("click", function() {
			editor.setGame(Number(element.value));
		});
	}

	for (let element of $$(".write")) {
		element.addEventListener("click", function() {
			editor.setWrite(Number(this.value), this.checked);
			editor.saveSinglePlayer();
		});
	}

	for (let element of $$(".slot")) {
		element.addEventListener("click", function() {
			editor.setSlot(Number(element.value));
		});
	}

	for (let element of $$(".stage")) {
		element.addEventListener("click", function() {
			editor.setStage(Number(element.value));
		});
	}

	for (let element of $$(".ring")) {
		element.addEventListener("click", function() {
			this.classList.toggle("active");
			editor.saveSinglePlayer();
		});
	}

	for (let element of $$(".arrow")) {
		element.addEventListener("click", function() {
			let id = element.closest("table").id;
			let select = $(`#${id} .zone`);

			let modifier = Number(this.value);
			let value = Number(select.value) + modifier;

			if (value >= 0 && value < select.length) {
				select.value = value;
			}

			editor.saveSinglePlayer();
		});
	}

	for (let element of $$("#singlePlayer .character")) {
		element.addEventListener("click", function() {
			let id = element.closest("table").id;
			editor.selectActive(`#${id} .character`, this.value);
			editor.saveSinglePlayer();
		});
	}

	for (let element of $$("#singlePlayer .new, #singlePlayer .clear")) {
		element.addEventListener("click", function() { // click event
			editor.saveSinglePlayer();
		});
	}

	for (let element of $$('#singlePlayer input[type="number"], .zone')) {
		element.addEventListener("input", function() { // input event
			editor.saveSinglePlayer();
		});
	}

	for (let element of $$("#s3 .emerald")) {
		element.addEventListener("click", function() {
			let chaos = this.classList.contains("chaos");
			this.classList.toggle("chaos", !chaos);
			this.classList.toggle("empty",  chaos);

			editor.saveSinglePlayer();
		});
	}

	for (let element of $$("#s3k .emerald")) {
		element.addEventListener("click", function() {
			// rotates through emerald states
			if (this.classList.contains("empty")) {
				this.classList.add("chaos");
				this.classList.remove("empty");
			} else if (this.classList.contains("chaos")) {
				this.classList.add("palace");
				this.classList.remove("chaos");
			} else if (this.classList.contains("palace")) {
				this.classList.add("super");
				this.classList.remove("palace");
			} else if (this.classList.contains("super")) {
				this.classList.add("empty");
				this.classList.remove("super");
			}

			editor.saveSinglePlayer();
		});
	}

	for (let element of $$("#competition .character")) {
		element.addEventListener("click", function() {
			let n = element.closest("tr").id.replace(/[^\d]+/, "");
			editor.selectActive(`#row${n} .character`, this.value);
			editor.saveCompetition();
		});
	}

	for (let element of $$("#competition input")) { // checkboxes and numbers
		element.addEventListener("input", function() {
			editor.saveCompetition();
		});
	}

	for (let element of $$("#advanced, .dataSize, .platform")) {
		element.addEventListener("click", function() {
			editor.toggleOptions();
		});
	}

	for (let element of $$(".close")) {
		element.addEventListener("click", function() {
			this.closest(".overlay").classList.remove("open");
		});
	}

	function load(callback) {
		let xhr = new XMLHttpRequest();

		// loads default save data
		xhr.addEventListener("readystatechange", function() {
			if (this.readyState == 4 && this.status == 200) {
				callback(this.response);
			}
		});
		xhr.open("GET", DEFAULT_SAVE_FILE, true);
		xhr.responseType = "arraybuffer";
		xhr.send();
	}

	function displayError(message) {
		$("#error").classList.add("open");
		$("#error p").textContent = message;
	}
});

function $(selector) {
	return document.querySelector(selector);
}

function $$(selector) {
	return Array.from(document.querySelectorAll(selector));
}

/*
 * Editor prototype
 */

function Editor() {
	this.save = null;
	this.defaults = [];

	this.currentGame  = S3K;
	this.currentSlot  = 0;
	this.currentStage = 0;

	this.writeS3  = false;
	this.writeS3K = true;

	this.showAdvanced = false;
}

Editor.prototype.open = function(save) {
	this.save = save;

	if (this.save.singlePlayerS3.length == 0) {
		this.save.singlePlayerS3 = this.defaults.slice(
			S3_START1, S3_START1 + S3_SECTION_LENGTH
		);
	}

	if (this.save.singlePlayerS3K.length == 0) {
		this.save.singlePlayerS3K = this.defaults.slice(
			S3K_START1, S3K_START1 + S3K_SECTION_LENGTH
		);
	}

	if (this.save.competition.length == 0) {
		this.save.competition = this.defaults.slice(
			CP_START1, CP_START1 + CP_SECTION_LENGTH
		);
	}

	if (!this.save.valid) {
		throw "File contained no valid data.";
	}

	this.writeS3  = this.getChecksum(this.save.singlePlayerS3)  != 0;
	this.writeS3K = this.getChecksum(this.save.singlePlayerS3K) != 0;

	this.setWrite(S3,  this.writeS3);
	this.setWrite(S3K, this.writeS3K);

	// sets game to Sonic 3 if no S3&K data available, otherwise sets to S3&K
	this.setGame(this.writeS3K);

	this.setSlot();
	this.setStage();
	this.setOptions();
	this.toggleOptions();
};

Editor.prototype.getChecksum = function(section) {
	return (section[section.length - 2] << 8) | section[section.length - 1];
};

Editor.prototype.loadDefaults = function(defaults) {
	this.defaults = defaults.file;
};

Editor.prototype.restoreDefaults = function() {
	let save = new Save();
	save.loadFromArray(this.defaults);

	this.open(save);

	// Sonic 3 is disabled by default but will not be disabled automatically
	// because default save file contains save data for both S3 and S3&K
	this.setWrite(S3, false);
	this.saveSinglePlayer();
};

Editor.prototype.saveToFile = function() {
	if (!this.writeS3 && !this.writeS3K) {
		throw "Must enable Sonic 3 or Sonic 3 & Knuckles.";
	}

	// merges changes to file buffer
	this.save.update(this.writeS3, this.writeS3K);

	let {platform, dataSize, byteOrder, fillerByte} = this.getOptions();

	if (!this.writeS3K && (platform == STEAM || platform == AIR)) {
		throw "Must enable Sonic 3 & Knuckles to save in this format.";
	}

	let file = this.save.save(platform, dataSize, byteOrder, fillerByte);
	let filename = "";

	if (platform == CONSOLE) {
		filename = this.writeS3K ? S3K_SAVE_NAME : S3_SAVE_NAME;
	} else if (platform == PC) {
		filename = PC_SAVE_NAME;
	} else if (platform == STEAM) {
		filename = STEAM_SAVE_NAME;
	} else if (platform == AIR) {
		filename = AIR_SAVE_NAME;
	}

	return [filename, new Blob([file], {type: MIME_TYPE})];
};

Editor.prototype.saveToStorage = function() {
	if (this.save != null) {
		this.save.update(this.writeS3, this.writeS3K);

		return {
			file:    Array.from(this.save.file),
			options: this.getOptions()
		};
	}
};

Editor.prototype.selectActive = function(selector, value) {
	for (let element of $$(selector)) {
		let condition = Number(element.value) == value;
		element.classList.toggle("active", condition);
	}
};

Editor.prototype.setGame = function(value) {
	this.currentGame = value;

	$("#s3").classList.toggle("hidden", this.currentGame);
	$("#s3k").classList.toggle("hidden", !this.currentGame);
	this.selectActive(".game", value);

	let max = (this.currentGame ? S3K_SLOTS : S3_SLOTS) - 1;
	this.setSlot(Math.min(this.currentSlot, max));

	for (let element of $$(".slot")) {
		element.disabled = Number(element.value) > max;
	}
};

Editor.prototype.setWrite = function(game, checked) {
	if (this.defaults == null) {
		return;
	}

	if (game == S3) {
		this.writeS3 = checked;
		$("#s3 .write").checked = checked;
		this.toggleElements("#s3 button, #s3 tbody input", !checked);

		// loads default values if data is empty
		if (this.getChecksum(this.save.singlePlayerS3) == 0) {
			this.save.singlePlayerS3 = this.defaults.slice(
				S3_START1, S3_START1 + S3_SECTION_LENGTH
			);
		}
	} else {
		this.writeS3K = checked;
		$("#s3k .write").checked = checked;
		this.toggleElements("#s3k button, #s3k tbody input", !checked);

		// loads default values if data is empty
		if (this.getChecksum(this.save.singlePlayerS3K) == 0) {
			this.save.singlePlayerS3K = this.defaults.slice(
				S3K_START1, S3K_START1 + S3K_SECTION_LENGTH
			);
		}
	}
};

Editor.prototype.setSlot = function(value=0) {
	this.currentSlot = value;
	this.loadSinglePlayer();
	this.selectActive(".slot", value);
};

Editor.prototype.setStage = function(value=0) {
	this.currentStage = value;
	this.loadCompetition();
	this.selectActive(".stage", value);
};

Editor.prototype.loadSinglePlayer = function() {
	const self = this;

	if (this.save == null) {
		return;
	}

	if (this.currentGame == S3) {
		loadSinglePlayerS3();
		loadTabs(this.save.getSlotCharactersS3(), S3_SLOTS, this.writeS3);
	} else {
		loadSinglePlayerS3K();
		loadTabs(this.save.getSlotCharactersS3K(), S3K_SLOTS, this.writeS3K);
	}

	function loadSinglePlayerS3() {
		let slot = self.save.getSaveSlotS3(self.currentSlot);

		if (self.writeS3) {
			self.toggleElements(
				'#s3 button, #s3 input[type="number"]',
				slot.isNew
			);
		}

		$("#s3 .new").checked   = slot.isNew;
		$("#s3 .clear").checked = slot.isClear;
		$("#last").value        = slot.last;

		self.selectActive("#s3 .character", slot.character);
		selectRings("#s3 .ring", slot.rings);
		selectZone("s3", slot.zone);
		clampZone(slot, $("#s3 .zone"), S3_LAST_ZONE);

		for (let element of $$("#s3 .emerald")) {
			let chaos = Number(element.value) & slot.emeralds;

			element.classList.toggle("empty", !chaos);
			element.classList.toggle("chaos",  chaos);
		}

		let image = "";

		if (self.writeS3) {
			if (slot.isNew) {
				image = "new";
			} else {
				if (slot.isClear) {
					// Sonic 3 shows Sonic picture regardless of character
					if (slot.numEmeralds >= EMERALDS) {
						image = "clear-sonic-chaos";
					} else {
						image = "clear-sonic";
					}
				} else {
					image = "zone-" + slot.zone.toString().padStart(2, "0");
				}
			}
		} else {
			image = "static";
		}

		$("#s3 .preview").src = "images/" + image + ".png";
	}

	function loadSinglePlayerS3K() {
		let slot = self.save.getSaveSlotS3K(self.currentSlot);

		if (self.writeS3K) {
			self.toggleElements(
				'#s3k button, #s3k input[type="number"]',
				slot.isNew
			);
		}

		$("#s3k .new").checked   = slot.isNew;
		$("#s3k .clear").checked = slot.isClear;
		$("#lives").value        = slot.lives;
		$("#continues").value    = slot.continues;

		self.selectActive("#s3k .character", slot.character);
		selectRings("#s3k .ring", slot.rings);
		selectZone("s3k", slot.zone);

		let numEmeralds = 0;

		for (let element of $$("#s3k .emerald")) {
			let offset = Number(element.value);
			let emeralds = slot.emeralds1;

			if (
				element.classList.contains("blue")
				|| element.classList.contains("red")
				|| element.classList.contains("grey")
			) {
				emeralds = slot.emeralds2;
			}

			let chaos  = Boolean(emeralds & (1 << offset));
			let palace = Boolean(emeralds & (1 << offset + 1));

			numEmeralds += Number(chaos || palace);

			element.classList.toggle("empty",  !chaos && !palace);
			element.classList.toggle("chaos",   chaos && !palace);
			element.classList.toggle("palace", !chaos &&  palace);
			element.classList.toggle("super",   chaos &&  palace);
		}

		let select = $("#s3k .zone");

		switch (slot.character) {
			case TAILS:
				clampZone(slot, select, TAILS_LAST_ZONE);
				break;
			case KNUCKLES:
				if (self.showAdvanced) {
					// allows Death Egg Zone to be selected for Knuckles
					clampZone(slot, select, KNUCKLES_LAST_ZONE + 1);
				} else {
					clampZone(slot, select, KNUCKLES_LAST_ZONE);
				}

				break;
			default:
				if (numEmeralds >= EMERALDS) {
					// value can be higher for cleared games
					clampZone(slot, select, SONIC_LAST_ZONE);
				} else {
					clampZone(slot, select, SONIC_LAST_ZONE - 1);
				}
		}

		// disables inaccessible zones
		for (let element of $$("#s3k .zone option")) {
			let value = Number(element.value);

			switch (slot.character) {
				case TAILS:
					element.disabled = value > TAILS_LAST_ZONE;
					break;
				case KNUCKLES:
					if (self.showAdvanced) {
						element.disabled = value > KNUCKLES_LAST_ZONE + 1;
					} else {
						element.disabled = value > KNUCKLES_LAST_ZONE;
					}

					break;
				default:
					if (numEmeralds >= EMERALDS) {
						element.disabled = false;
					} else {
						element.disabled = value > SONIC_LAST_ZONE - 1;
					}
			}
		}

		let image = "";

		if (self.writeS3K) {
			if (slot.isNew) {
				image = "new";
			} else {
				if (slot.isClear) { // clear
					if (slot.isClear == SUPER_CLEAR) { // all super emeralds
						image = "clear-super";
					} else {
						switch (slot.character) {
							case TAILS:
								image = "clear-tails";
								break;
							case KNUCKLES:
							case KNUCKLES_TAILS:
								image = "clear-knuckles";
								break;
							default:
								image = "clear-sonic";
						}

						if (slot.isClear == CHAOS_CLEAR) { // all chaos emeralds
							image += "-chaos";
						}
					}
				} else {
					image = "zone-" + slot.zone.toString().padStart(2, "0");
				}
			}
		} else {
			image = "static";
		}

		$("#s3k .preview").src = "images/" + image + ".png";
	}

	function loadTabs(characters, max, enabled) {
		for (let [i, element] of $$(".slot").entries()) {
			if (i >= max || !enabled) {
				element.classList.remove(
					"sonic", "tails", "sonictails", "knuckles", "knucklestails"
				);
			} else {
				let character = characters[i];

				element.classList.toggle("sonic", character == SONIC);
				element.classList.toggle("tails", character == TAILS);
				element.classList.toggle("sonictails", character == SONIC_TAILS);
				element.classList.toggle("knuckles",   character == KNUCKLES);
				element.classList.toggle(
					"knucklestails", character == KNUCKLES_TAILS
				);
			}
		}
	}

	function selectRings(selector, rings) {
		for (let element of $$(selector)) {
			let condition = rings & (1 << Number(element.value));
			element.classList.toggle("active", condition != 0);
		}
	}

	function selectZone(id, zone) {
		let select = $(`#${id} .zone`);
		select.value = zone;

		let clear = $(`#${id} .new`).checked || $(`#${id} .clear`).checked;
		$(`#${id} .zone`).disabled = clear;
		$(`#${id} .prev`).disabled = clear || select.value == 0;
		$(`#${id} .next`).disabled = clear || select.value == select.length - 1;
	}

	function clampZone(slot, select, lastZone) {
		if (slot.zone > lastZone) {
			select.value = lastZone;
			slot.zone = lastZone;
		}
	}
};

Editor.prototype.saveSinglePlayer = function() {
	const self = this;

	if (this.save == null) {
		return;
	}

	if (this.currentGame == S3) {
		saveSinglePlayerS3();
	} else {
		saveSinglePlayerS3K();
	}

	function saveSinglePlayerS3() {
		let emeralds = 0, numEmeralds = 0;

		for (let element of $$("#s3 .emerald")) {
			if (element.classList.contains("chaos")) {
				emeralds += Number(element.value);
				numEmeralds++;
			}
		}

		self.save.setSaveSlotS3(self.currentSlot, {
			isNew:       $("#s3 .new").checked,
			isClear:     $("#s3 .clear").checked,
			character:   getCharacter("#s3 .character.active"),
			zone:        Number($("#s3 .zone").value) || 0,
			last:        getNumber("#last"),
			numEmeralds: numEmeralds,
			emeralds:    emeralds,
			rings:       getRings("#s3 .ring")
		});
		self.loadSinglePlayer();
	}

	function saveSinglePlayerS3K() {
		let emeralds1 = 0, emeralds2 = 0, chaosEmeralds = 0, superEmeralds = 0;

		for (let element of $$("#s3k .emerald")) {
			let offset = Number(element.value);
			let chaos  = element.classList.contains("chaos");
			let palace = element.classList.contains("palace");

			if (element.classList.contains("super")) {
				chaos  = true;
				palace = true;
			}

			if (
				element.classList.contains("blue")
				|| element.classList.contains("red")
				|| element.classList.contains("grey")
			) {
				if (chaos || palace) {
					if (chaos) {
						emeralds2 |= 1 << offset;
					}

					if (palace) {
						emeralds2 |= 1 << offset + 1;
					}

					chaosEmeralds++;
					superEmeralds += Number(chaos && palace);
				}
			} else {
				if (chaos || palace) {
					if (chaos) {
						emeralds1 |= 1 << offset;
					}

					if (palace) {
						emeralds1 |= 1 << offset + 1;
					}

					chaosEmeralds++;
					superEmeralds += Number(chaos && palace);
				}
			}
		}

		let clear = 0;

		if ($("#s3k .clear").checked) {
			if (superEmeralds >= EMERALDS) {
				clear = SUPER_CLEAR;
			} else if (chaosEmeralds >= EMERALDS) {
				clear = CHAOS_CLEAR;
			} else {
				clear = CLEAR;
			}
		}

		self.save.setSaveSlotS3K(self.currentSlot, {
			isNew:       $("#s3k .new").checked,
			isClear:     clear,
			character:   getCharacter("#s3k .character.active"),
			numEmeralds: chaosEmeralds,
			zone:        Number($("#s3k .zone").value) || 0,
			rings:       getRings("#s3k .ring"),
			emeralds1:   emeralds1,
			emeralds2:   emeralds2,
			lives:       getNumber("#lives"),
			continues:   getNumber("#continues")
		});
		self.loadSinglePlayer();
	}

	function getNumber(selector) {
		let element = $(selector);
		let value = Number(element.value);
		value = Math.min(element.max, value);
		value = Math.max(element.min, value);

		return value;
	}

	function getCharacter(selector) {
		let element = $(selector);

		// checks if element exists before attempting to use its value
		return element ? Number(element.value) : 0;
	}

	function getRings(selector) {
		let rings = 0;

		for (let element of $$(selector)) {
			if (element.classList.contains("active")) {
				rings |= 1 << Number(element.value);
			}
		}

		return rings;
	}
};

Editor.prototype.loadCompetition = function() {
	let rows = this.save.getStage(this.currentStage);

	for (let [i, row] of rows.entries()) {
		$(`#row${i} .new`).checked = row.isNew;
		$(`#row${i} .min`).value   = row.min.toString();
		$(`#row${i} .sec`).value   = row.sec.toString().padStart(2, "0");
		$(`#row${i} .tick`).value  = row.tick.toString().padStart(2, "0");

		this.toggleElements(
			`#row${i} button, #row${i} input[type="number"]`,
			row.isNew
		);
		this.selectActive(`#row${i} .character`, row.character);
	}
};

Editor.prototype.saveCompetition = function() {
	let rows = Array(CP_RANKINGS).fill().map(function() {
		return {};
	});

	rows = fillBoolean("#competition .new", "isNew");
	rows = fillNumber("#competition .min",  "min");
	rows = fillNumber("#competition .sec",  "sec");
	rows = fillNumber("#competition .tick", "tick");
	rows = fillButtons("#competition .character", "character");

	this.save.setStage(this.currentStage, rows);
	this.loadCompetition();

	function fillBoolean(selector, key) {
		for (let [i, element] of $$(selector).entries()) {
			rows[i][key] = element.checked;
		}

		return rows;
	}

	function fillNumber(selector, key) {
		for (let [i, element] of $$(selector).entries()) {
			let value = Number(element.value);
			value = Math.min(element.max, value);
			value = Math.max(element.min, value);

			rows[i][key] = value;
		}

		return rows;
	}

	function fillButtons(selector, key) {
		let n = 0;

		for (let element of $$(selector)) {
			if (element.classList.contains("active")) {
				rows[n][key] = Number(element.value);
				n++; // only increments once per table row
			}
		}

		return rows;
	}
};

Editor.prototype.getOptions = function() {
	return {
		platform:   readPlatform(),
		dataSize:   $("#word").checked,
		byteOrder:  $("#big").checked,
		fillerByte: $("#b00").checked ? 0x00 : 0xff
	};

	function readPlatform() {
		for (let element of $$(".platform")) {
			if (element.checked) {
				return Number(element.value);
			}
		}

		return CONSOLE;
	}
};

Editor.prototype.setOptions = function() {
	if (this.save == null) {
		return;
	}

	let platform = this.save.platform;

	for (let element of $$(".platform")) {
		element.checked = Number(platform) == Number(element.value);
	}

	for (let element of $$(".dataSize")) {
		element.checked = Number(this.save.dataSize) == Number(element.value);
		element.disabled = platform != CONSOLE;
	}

	for (let element of $$(".fillerByte")) {
		element.checked = Number(this.save.fillerByte) == Number(element.value);
		element.disabled = platform != CONSOLE || this.save.dataSize == BYTE;
	}

	for (let element of $$(".byteOrder")) {
		element.checked = Number(this.save.byteOrder) == Number(element.value);
		element.disabled = platform != CONSOLE || this.save.dataSize == BYTE;
	}
};

Editor.prototype.toggleOptions = function() {
	let advanced = $("#advanced").checked;

	for (let element of $$(".advanced")) {
		element.classList.toggle("hidden", !advanced);
	}

	let air = $("#air").checked;

	for (let element of $$(".air")) {
		element.classList.toggle("hidden", !air);
	}

	if (air) { // never shows Blue Knuckles for AIR
		$(".blueknuckles").classList.add("hidden");
	}

	let {platform, dataSize, byteOrder, fillerByte} = this.getOptions();

	for (let element of $$(".dataSize")) {
		element.disabled = platform;
	}

	for (let element of $$(".fillerByte, .byteOrder")) {
		element.disabled = byteOrder || platform;
	}

	this.showAdvanced = advanced;
	this.saveSinglePlayer();
};

Editor.prototype.toggleElements = function(selector, condition) {
	for (let element of $$(selector)) {
		element.disabled = condition;
	}
};

Editor.prototype.toggleHexView = function() {
	if (this.save == null) {
		return;
	}

	if ($("#hexview").classList.contains("open")) {
		$("#col").textContent = "";
		$("#hex").textContent = "";
		$("#asc").textContent = "";

		$("#hexview").classList.remove("open");
	} else {
		let col = "", hex = "", asc = "";

		this.save.update(this.writeS3, this.writeS3K);

		for (let [i, character] of this.save.file.entries()) {
			hex += character.toString(16).padStart(2, "0") + " ";

			// range of printable characters in ASCII
			if (character >= 0x20 && character <= 0x7e) {
				asc += String.fromCharCode(character) + " ";
			} else {
				asc += "  ";
			}

			if (i % HEX_VIEW_WIDTH == 0) {
				col += i.toString(16).padStart(4, "0") + "\n";
			} else if ((i + 1) % HEX_VIEW_WIDTH == 0) {
				hex += "\n";
				asc += "\n";
			}
		}

		$("#col").textContent = col;
		$("#hex").textContent = hex;
		$("#asc").textContent = asc;

		$("#hexview").classList.add("open");
	}
};

/*
 * Save prototype
 */

function Save() {
	this.file = null;
	this.valid = false;

	this.platform = CONSOLE;
	this.dataSize = WORD;
	this.byteOrder = BIG_ENDIAN;
	this.fillerByte = 0x00;

	this.singlePlayerS3  = [];
	this.singlePlayerS3K = [];
	this.competition     = [];
}

Save.prototype.loadFromArray = function(arr) {
	this.file = Uint8Array.from(arr);
	this.parse();
};

// loaded from local storage
Save.prototype.loadFromObject = function(obj) {
	if (obj.file != undefined) {
		this.loadFromArray(obj.file);
	}

	if (obj.options != undefined) {
		this.platform = obj.options.platform;
		this.dataSize = obj.options.dataSize;
		this.byteOrder = obj.options.byteOrder;
		this.fillerByte = obj.options.fillerByte;
	}
};

// loaded from file
Save.prototype.loadFromBuffer = function(buffer) {
	this.file = new Uint8Array(buffer);

	// tries to determine file format by searching for constants
	// at end of competition section
	if (this.file[0x50] == 0x44 && this.file[0x51] == 0x4c) {
		this.dataSize = BYTE;
		this.platform = PC;
		this.byteOrder = LITTLE_ENDIAN;

		this.convertFromPC();
	} else if (this.file[0x58] == 0x4c && this.file[0x59] == 0x44) {
		this.dataSize = BYTE;
		this.platform = CONSOLE;
		this.byteOrder = BIG_ENDIAN;
	} else if (this.file[0xb4] == 0x4c && this.file[0xb6] == 0x44) {
		this.dataSize = WORD;
		this.platform = STEAM;
		this.byteOrder = BIG_ENDIAN;
		this.fillerByte = 0x00;

		this.convertFromSteam();
		this.file = this.file.filter(convertFromBigEndian);
	} else if (this.file[0xb0] == 0x4c && this.file[0xb2] == 0x44) {
		this.dataSize = WORD;
		this.byteOrder = LITTLE_ENDIAN;
		this.fillerByte = this.file[0xb1];

		this.file = this.file.filter(convertFromLittleEndian);
	} else if (this.file[0xb1] == 0x4c && this.file[0xb3] == 0x44) {
		this.dataSize = WORD;
		this.byteOrder = BIG_ENDIAN;
		this.fillerByte = this.file[0xb2];

		this.file = this.file.filter(convertFromBigEndian);
	} else {
		let slice = this.file.slice(0, AIR_IDENTIFIER.length);
		let identifier = this.hexToStr(slice);

		if (identifier == AIR_IDENTIFIER) {
			this.dataSize = BYTE;
			this.platform = AIR;
			this.byteOrder = LITTLE_ENDIAN;

			this.convertFromAIR();
		} else {
			throw "Could not determine format of file.";
		}
	}

	this.parse();

	function convertFromLittleEndian(undefined, i) {
		return i % 2 == 0; // skips even bytes
	}

	function convertFromBigEndian(undefined, i) {
		return i % 2 != 0; // skips odd bytes
	}
};

Save.prototype.parse = function() {
	const self = this;

	this.singlePlayerS3 = checkChecksums(
		this.file.slice(S3_START1, S3_START1 + S3_SECTION_LENGTH),
		this.file.slice(S3_START2, S3_START2 + S3_SECTION_LENGTH)
	);
	this.singlePlayerS3K = checkChecksums(
		this.file.slice(S3K_START1, S3K_START1 + S3K_SECTION_LENGTH),
		this.file.slice(S3K_START2, S3K_START2 + S3K_SECTION_LENGTH)
	);
	this.competition = checkChecksums(
		this.file.slice(CP_START1, CP_START1 + CP_SECTION_LENGTH),
		this.file.slice(CP_START2, CP_START2 + CP_SECTION_LENGTH)
	);

	// at least one section must be present in file to be valid
	this.valid |= this.singlePlayerS3.length > 0;
	this.valid |= this.singlePlayerS3K.length > 0;
	this.valid |= this.competition.length > 0;

	// all data is duplicated in the save file for integrity;
	// uses first set if checksum passes,
	// otherwise uses second set if checksum passes,
	// otherwise returns empty array
	function checkChecksums(arr1, arr2) {
		let result = [];

		if (self.verifyChecksum(arr1)) {
			result = arr1;
		} else {
			if (self.verifyChecksum(arr2)) {
				result = arr2;
			} else {
				result = [];
			}
		}

		return result;
	}
};

Save.prototype.update = function(writeS3=true, writeS3K=true) {
	this.singlePlayerS3  = this.updateChecksum(this.singlePlayerS3);
	this.singlePlayerS3K = this.updateChecksum(this.singlePlayerS3K);
	this.competition     = this.updateChecksum(this.competition);

	const self = this;

	mergeSection(S3_START1,  this.singlePlayerS3,  writeS3);
	mergeSection(S3_START2,  this.singlePlayerS3,  writeS3);
	mergeSection(S3K_START1, this.singlePlayerS3K, writeS3K);
	mergeSection(S3K_START2, this.singlePlayerS3K, writeS3K);
	mergeSection(CP_START1,  this.competition);
	mergeSection(CP_START2,  this.competition);

	function mergeSection(start, source, write=true) {
		let stop = start + source.length;

		for (let i = start, n = 0; i < stop; i++, n++) {
			self.file[i] = write ? source[n] : 0;
		}
	}
};

Save.prototype.save = function(platform, dataSize, byteOrder, fillerByte) {
	let file = null;

	if (platform == PC) {
		file = this.convertToPC();
	} else if (platform == STEAM) {
		file = this.convertToSteam();
	} else if (platform == AIR) {
		file = this.convertToAIR();
	} else {
		if (dataSize == BYTE) {
			file = this.file;
		} else {
			if (byteOrder == LITTLE_ENDIAN) {
				file = convertToLittleEndian(this.file);
			} else {
				file = convertToBigEndian(this.file);
			}
		}
	}

	return file;

	function convertToLittleEndian(oldFile) {
		// using Uint8Array because the byte order of numbers saved in
		// Uint16Array is architecture-dependent
		let newFile = new Uint8Array(CONSOLE_SIZE * 2);

		for (let i = 0, n = 0; i < newFile.length; i += 2, n++) {
			newFile[i]     = oldFile[n];
			newFile[i + 1] = fillerByte;
		}

		return newFile;
	}

	function convertToBigEndian(oldFile) {
		let newFile = new Uint8Array(CONSOLE_SIZE * 2);

		for (let i = 0, n = 0; i < newFile.length; i += 2, n++) {
			newFile[i]     = fillerByte;
			newFile[i + 1] = oldFile[n];
		}

		return newFile;
	}
};

Save.prototype.calculateChecksum = function(bytes) {
	const BIT_MASK = 0x8810;
	let checksum = 0;

	for (let i = 0; i < bytes.length - 2; i += 2) {
		checksum ^= (bytes[i] << 8) | bytes[i + 1];

		let carry = checksum & 1; // gets least significant bit before shift
		checksum >>>= 1;

		if (carry != 0) {
			checksum ^= BIT_MASK;
		}
	}

	return checksum;
};

Save.prototype.verifyChecksum = function(bytes) {
	// saves original checksum
	let original = (bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1];
	let checksum = this.calculateChecksum(bytes);

	return original == checksum;
};

Save.prototype.updateChecksum = function(bytes) {
	let checksum = this.calculateChecksum(bytes);

	// writes new checksum to last two bytes of data
	bytes[bytes.length - 2] = (checksum & 0xff00) >> 8;
	bytes[bytes.length - 1] =  checksum & 0x00ff;

	return bytes;
};

Save.prototype.removeChecksum = function(bytes) {
	bytes[bytes.length - 2] = 0;
	bytes[bytes.length - 1] = 0;

	return bytes;
};

Save.prototype.getSaveSlotS3 = function(currentSlot) {
	let pos = currentSlot * S3_SLOT_LENGTH;
	let zone = this.singlePlayerS3[pos + 3];

	// adjusts zones after Flying Battery to match S3&K
	if (zone > 4) {
		zone--;
	}

	return {
		isNew:       this.singlePlayerS3[pos] == NEW,
		isClear:     zone > S3_LAST_ZONE,
		character:   this.singlePlayerS3[pos + 2],
		zone:        zone,
		last:        this.singlePlayerS3[pos + 4],
		numEmeralds: this.singlePlayerS3[pos + 5],
		emeralds:    this.singlePlayerS3[pos + 6],
		rings:       this.singlePlayerS3[pos + 7]
	};
};

Save.prototype.getSaveSlotS3K = function(currentSlot) {
	let pos = currentSlot * S3K_SLOT_LENGTH;
	let clear = this.singlePlayerS3K[pos];

	if (clear > SUPER_CLEAR) {
		clear = 0;
	}

	return {
		isNew:       this.singlePlayerS3K[pos] == NEW,
		isClear:     clear,
		character:   (this.singlePlayerS3K[pos + 2] & 0xf0) >> 4,
		numEmeralds: this.singlePlayerS3K[pos + 2] & 0x0f,
		zone:        this.singlePlayerS3K[pos + 3],
		rings:       this.singlePlayerS3K[pos + 4],
		emeralds1:   this.singlePlayerS3K[pos + 6],
		emeralds2:   this.singlePlayerS3K[pos + 7],
		lives:       this.singlePlayerS3K[pos + 8],
		continues:   this.singlePlayerS3K[pos + 9]
	};
};

Save.prototype.getSlotCharactersS3 = function() {
	let characters = [];

	for (let i = 0; i < S3_SLOTS; i++) {
		let pos = i * S3_SLOT_LENGTH;

		let isNew     = this.singlePlayerS3[pos] == NEW;
		let character = this.singlePlayerS3[pos + 2];

		characters.push(isNew ? NOBODY : character);
	}

	return characters;
};

Save.prototype.getSlotCharactersS3K = function() {
	let characters = [];

	for (let i = 0; i < S3K_SLOTS; i++) {
		let pos = i * S3K_SLOT_LENGTH;

		let isNew     = this.singlePlayerS3K[pos] == NEW;
		let character = (this.singlePlayerS3K[pos + 2] & 0xf0) >> 4;

		characters.push(isNew ? NOBODY : character);
	}

	return characters;
};

Save.prototype.setSaveSlotS3 = function(currentSlot, slot) {
	let pos = currentSlot * S3_SLOT_LENGTH;

	if (slot.isNew) {
		this.singlePlayerS3[pos]     = NEW;
		this.singlePlayerS3[pos + 1] = 0;
		this.singlePlayerS3[pos + 2] = 0;
		this.singlePlayerS3[pos + 3] = 0;
		this.singlePlayerS3[pos + 4] = 0;
		this.singlePlayerS3[pos + 5] = 0;
		this.singlePlayerS3[pos + 6] = 0;
		this.singlePlayerS3[pos + 7] = 0;
	} else {
		let zone = slot.zone;

		if (slot.isClear) {
			zone = S3_LAST_ZONE + 1;
		}

		// adjust from S3&K numbering
		if (zone >= 4) {
			zone++;
		}

		this.singlePlayerS3[pos]     = 0;
		this.singlePlayerS3[pos + 1] = 0; // always zero
		this.singlePlayerS3[pos + 2] = slot.character;
		this.singlePlayerS3[pos + 3] = zone;
		this.singlePlayerS3[pos + 4] = slot.last;
		this.singlePlayerS3[pos + 5] = slot.numEmeralds;
		this.singlePlayerS3[pos + 6] = slot.emeralds;
		this.singlePlayerS3[pos + 7] = slot.rings;
	}
};

Save.prototype.setSaveSlotS3K = function(currentSlot, slot) {
	let pos = currentSlot * S3K_SLOT_LENGTH;

	if (slot.isNew) {
		this.singlePlayerS3K[pos]     = NEW;
		this.singlePlayerS3K[pos + 1] = 0;
		this.singlePlayerS3K[pos + 2] = 0;
		this.singlePlayerS3K[pos + 3] = 0;
		this.singlePlayerS3K[pos + 4] = 0;
		this.singlePlayerS3K[pos + 5] = 0;
		this.singlePlayerS3K[pos + 6] = 0;
		this.singlePlayerS3K[pos + 7] = 0;
		this.singlePlayerS3K[pos + 8] = 0;
		this.singlePlayerS3K[pos + 9] = 0;
	} else {
		let numEmeralds = slot.numEmeralds;

		// goes back to 0 when all emeralds collected
		if (numEmeralds >= EMERALDS) {
			numEmeralds = 0;
		}

		let zone = slot.zone;

		if (slot.isClear) {
			switch (slot.character) {
				case TAILS:
					zone = TAILS_LAST_ZONE;
					break;
				case KNUCKLES:
					zone = KNUCKLES_LAST_ZONE;
					break;
				default:
					if (
						slot.isClear == CHAOS_CLEAR
						|| slot.isClear == SUPER_CLEAR
					) {
						zone = SONIC_LAST_ZONE; // Doomsday
					} else {
						zone = SONIC_LAST_ZONE - 1; // Death Egg
					}
			}

			zone++;
		}

		this.singlePlayerS3K[pos]     = slot.isClear;
		this.singlePlayerS3K[pos + 1] = 0; // always zero
		this.singlePlayerS3K[pos + 2] = slot.character << 4 | numEmeralds;
		this.singlePlayerS3K[pos + 3] = zone;
		this.singlePlayerS3K[pos + 4] = slot.rings;
		this.singlePlayerS3K[pos + 5] = 0; // always zero
		this.singlePlayerS3K[pos + 6] = slot.emeralds1;
		this.singlePlayerS3K[pos + 7] = slot.emeralds2;
		this.singlePlayerS3K[pos + 8] = slot.lives;
		this.singlePlayerS3K[pos + 9] = slot.continues;
	}
};

Save.prototype.getStage = function(currentStage) {
	let start = currentStage * CP_SLOT_LENGTH * (CP_RANKINGS + 1);
	let rows = [];

	for (let i = 0; i < CP_RANKINGS; i++) {
		let pos = start + i * CP_SLOT_LENGTH;
		let character = start + CP_SLOT_LENGTH * CP_RANKINGS + i;

		rows.push({
			isNew: this.competition[pos] == NEW,
			min:   this.competition[pos + 1],
			sec:   this.competition[pos + 2],
			tick:  this.competition[pos + 3],
			character: this.competition[character]
		});
	}

	return rows;
};

Save.prototype.setStage = function(currentStage, rows) {
	let pos = currentStage * (CP_SLOT_LENGTH * (CP_RANKINGS + 1));
	// start of characters slot
	let characters = pos + CP_SLOT_LENGTH * CP_RANKINGS;

	for (let [i, row] of rows.entries()) {
		if (row.isNew) {
			this.competition[pos]     = NEW;
			this.competition[pos + 1] = 0;
			this.competition[pos + 2] = 0;
			this.competition[pos + 3] = 0;
			this.competition[characters + i] = 0;
		} else {
			this.competition[pos]     = 0;
			this.competition[pos + 1] = row.min;
			this.competition[pos + 2] = row.sec;
			this.competition[pos + 3] = row.tick;
			this.competition[characters + i] = row.character;
		}

		pos += 4;
	}
};

Save.prototype.convertFromPC = function() {
	this.singlePlayerS3 = this.file.slice(
		S3_START_PC, S3_START_PC + S3_SECTION_LENGTH
	);
	this.singlePlayerS3K = this.file.slice(
		S3K_START_PC, S3K_START_PC + S3K_SECTION_LENGTH
	);
	this.competition = this.file.slice(
		CP_START_PC, CP_START_PC + CP_SECTION_LENGTH
	);

	for (let i = 0; i < S3K_SLOTS; i++) {
		let pos = i * S3K_SLOT_LENGTH;

		let emeralds1 = this.singlePlayerS3K[pos + 6];
		let emeralds2 = this.singlePlayerS3K[pos + 7];

		this.singlePlayerS3K[pos + 6] = emeralds2;
		this.singlePlayerS3K[pos + 7] = emeralds1;
	}

	for (let i = 0; i < CP_STAGES; i++) {
		let start = i * CP_SLOT_LENGTH * (CP_RANKINGS + 1);

		for (let j = 0; j < CP_RANKINGS; j++) {
			let pos = start + j * CP_SLOT_LENGTH;

			let isNew = this.competition[pos];
			let min   = this.competition[pos + 1];
			let sec   = this.competition[pos + 2];
			let tick  = this.competition[pos + 3];

			this.competition[pos]     = tick;
			this.competition[pos + 1] = sec;
			this.competition[pos + 2] = min;
			this.competition[pos + 3] = isNew;
		}
	}

	// creates new structure and merges PC data into it at console locations
	this.file = new Uint8Array(CONSOLE_SIZE);
	this.update();
};

Save.prototype.convertToPC = function() {
	// PC version is zero-padded to 1 KB, still uses byte-length
	let file = new Uint8Array(PC_SIZE);

	// copies arrays and removes checksums
	let singlePlayerS3  = this.removeChecksum(this.singlePlayerS3.slice());
	let singlePlayerS3K = this.removeChecksum(this.singlePlayerS3K.slice());
	let competition     = this.removeChecksum(this.competition.slice());

	for (let i = 0; i < S3K_SLOTS; i++) {
		let pos = i * S3K_SLOT_LENGTH;

		let emeralds1 = singlePlayerS3K[pos + 7];
		let emeralds2 = singlePlayerS3K[pos + 6];

		singlePlayerS3K[pos + 6] = emeralds1;
		singlePlayerS3K[pos + 7] = emeralds2;
	}

	for (let i = 0; i < CP_STAGES; i++) {
		let start = i * CP_SLOT_LENGTH * (CP_RANKINGS + 1);

		for (let j = 0; j < CP_RANKINGS; j++) {
			let pos = start + j * CP_SLOT_LENGTH;

			let isNew = competition[pos + 3];
			let min   = competition[pos + 2];
			let sec   = competition[pos + 1];
			let tick  = competition[pos];

			competition[pos]    = isNew;
			competition[pos +1] = min;
			competition[pos +2] = sec;
			competition[pos +3] = tick;
		}
	}

	mergeSection(S3_START_PC,  singlePlayerS3);
	mergeSection(S3K_START_PC, singlePlayerS3K);
	mergeSection(CP_START_PC,  competition);

	return file;

	function mergeSection(start, source) {
		let stop = start + source.length;

		for (let i = start, n = 0; i < stop; i++, n++) {
			file[i] = source[n];
		}
	}
};

Save.prototype.convertFromSteam = function() {
	this.file = this.file.slice(3, CONSOLE_SIZE * 2);
};

Save.prototype.convertToSteam = function() {
	let file = new Uint8Array(STEAM_SIZE);

	// file always starts with these bytes
	file[0] = 0x2c;
	file[1] = 0x80;
	file[2] = 0x02;

	for (let i = 4, n = 0; i < CONSOLE_SIZE * 2; i += 2, n++) {
		file[i] = this.file[n];
	}

	return file;
};

Save.prototype.convertFromAIR = function() {
	let name = "", inName = false, sections = {};

	for (let i = AIR_START; i < this.file.length; i++) {
		let character = this.file[i];

		if (inName) {
			if (character == 0x00) {
				inName = false;
				sections[name] = [];
			} else {
				name += String.fromCharCode(character);
			}
		} else {
			if (character == 0x53) { // S
				let slice = this.file.slice(i, i + AIR_PREFIX.length);
				let str = this.hexToStr(slice);

				if (str == AIR_PREFIX) {
					inName = true;
					name = String.fromCharCode(character);
				}
			}

			if (!inName && sections[name] != undefined) {
				sections[name].push(character);
			}
		}
	}

	this.singlePlayerS3K = getSection(AIR_SECTION_SP);
	this.competition     = getSection(AIR_SECTION_CP);

	this.file = new Uint8Array(CONSOLE_SIZE);
	this.update();

	function getSection(name) {
		if (sections[name] != undefined) {
			let section = sections[name];
			return section.slice(2, section.length);
		}

		return [];
	}
};

Save.prototype.convertToAIR = function() {
	let file = new Uint8Array(AIR_SIZE);
	let pos = 0;

	let sections = {};
	sections[AIR_SECTION_SP] = this.removeChecksum(this.singlePlayerS3K);
	sections[AIR_SECTION_CP] = this.removeChecksum(this.competition);

	let length = Object.keys(sections).length;

	writeString(AIR_IDENTIFIER);
	writeBytes([length, 0x00, 0x00, 0x00, 0x0e, 0x00, 0x00, 0x00]);
	writeSection(AIR_SECTION_SP);
	writeSection(AIR_SECTION_CP);

	return file;

	function writeBytes(arr) {
		for (let i = 0; i < arr.length; i++, pos++) {
			file[pos] = arr[i];
		}
	}

	function writeString(str) {
		for (let i = 0; i < str.length; i++, pos++) {
			file[pos] = str.charCodeAt(i);
		}
	}

	function writeSection(name, data) {
		writeString(name);
		writeBytes([0x00, 0x00, 0x00]);
		writeBytes(sections[name]);
	}
};

Save.prototype.hexToStr = function(arr) {
	// converts hex to ASCII
	return arr.reduce(function(str, hex) {
		return str + String.fromCharCode(hex);
	}, "");
};

/*
 * Storage prototype
 */

function Storage(name) {
	this.name = name;
}

Storage.prototype.load = function() {
	try {
		let contents = localStorage.getItem(this.name);

		if (contents != null) {
			return JSON.parse(contents);
		}
	} catch (err) {
		console.error(err);
		this.reset();
		return null;
	}
};

Storage.prototype.save = function(file) {
	try {
		if (file != undefined) {
			localStorage.setItem(this.name, JSON.stringify(file));
		} else {
			this.reset();
		}
	} catch (err) {
		console.error(err);
	}
};

Storage.prototype.reset = function() {
	try {
		localStorage.removeItem(this.name);
	} catch (err) {
		console.error(err);
	}
};
