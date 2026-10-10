-- Import PDFs into ABBYY FineReader PDF (German UI), export one searchable PDF
-- per file, then delete the unsaved OCR project. No .frdoc is written.
--
-- Usage:
--   osascript import_projekte.applescript <file.pdf|folder> [dest-folder] [timeout-minutes] [--from <ga>]
-- Destination defaults to /Volumes/Steiner/GA 180dpi/AbbyyFineReader.
-- A leading ~ in a path is expanded to the home directory.
-- --from 104 starts at GA 104 (including 104a, 104b, …). --from 104a skips GA 104.
-- A second bare number is the same start (folder dest 45 104). "104a" or "GA 104"
-- is always a start, never a timeout. The first bare number stays the timeout.
--
-- Per file:
--   1. Activate FineReader, Cmd+N, click "Bilder in neues OCR-Projekt importieren".
--   2. In the open panel, Cmd+Shift+G, enter the POSIX path, Return, click "Öffnen".
--      Fail the file unless a new window titled "Ohne Titel" or "Ohne Titel 2"
--      (and further numbers) appears. An older untitled window is left alone.
--   3. Wait out "Seiten hinzufügen" and "Seiten werden erkannt".
--      Done only when the status text has neither phrase and "Exportieren" stays
--      enabled for settleSeconds (default 5). The phase-2 warning triangle and its
--      count are normal and are never a failure.
--   4. Cmd+E. In "Exportieren nach" choose PDF / Durchsuchbare PDF /
--      Layout "Text unter dem Seitenbild" / Bilder beibehalten / Hohe Qualität /
--      Seitenzahlen, Kopf- und Fußzeilen beibehalten. MRC, PDF/A and PDF/UA stay off.
--      Weiter…, then the save panel (button "Exportieren", not "Sichern"):
--      turn off "Dokument nach dem Speichern öffnen", Cmd+Shift+G to the
--      destination, set the source basename, click "Exportieren".
--      Fail the file unless that PDF exists, is larger than 0 bytes, and its size
--      has stayed still for settleSeconds.
--   5. Cmd+W on that untitled window and click "Löschen", so the OCR project is discarded.
--
-- Names below are the observed German UI. If a control is not found by name,
-- the error lists the buttons that were visible; point importButtonPath at the
-- dump once ui-dumps/ shows a different structure.

property appName : "ABBYY FineReader PDF"
property importButtonName : "Bilder in neues OCR-Projekt importieren"
property openButtonName : "Öffnen"
property saveButtonName : "Sichern"
property exportButtonName : "Exportieren"
property nextButtonName : "Weiter..."
property cancelButtonName : "Abbrechen"
property exportWindowTitle : "Exportieren nach"
property searchablePdfName : "Durchsuchbare PDF"
property layoutItemName : "Text unter dem Seitenbild"
property qualityItemName : "Hohe Qualität"
property keepPicturesName : "Bilder beibehalten"
property mrcName : "Bilder mit MRC"
property keepHeadersName : "Seitenzahlen, Kopf- und Fußzeilen beibehalten"
property keepColorsName : "Text- und Hintergrundfarben beibehalten"
property pdfaName : "PDF/A"
property pdfuaName : "PDF/UA"
property openAfterFragment : "nach dem Speichern"
property exportingPhase : "Exportieren..."
property untitledMarker : "Ohne Titel"
-- Canonical title of the untitled window this run opened ("Ohne Titel" or "Ohne Titel 2").
property activeUntitledName : ""
property phaseAdd : "Seiten hinzufügen"
property phaseRecognize : "Seiten werden erkannt"
-- Discard button on the close sheet "Möchtest du dieses neue Dokument behalten?".
property discardButtonName : "Löschen"
property discardFallbacks : {"Löschen", "Nicht sichern", "Nicht speichern", "Verwerfen"}
property ownsUntitled : false
property baselineUntitled : 0
-- Optional path of UI roles from the front window, used only when the name search fails.
-- Example after a dump: {"AXSplitGroup", "AXGroup", "AXButton"}
property importButtonPath : {}
property settleSeconds : 5
property pollSeconds : 1
property defaultTimeoutSeconds : 90 * 60
property defaultDestFolder : "/Volumes/Steiner/GA 180dpi/AbbyyFineReader"
property logPath : ""

on run argv
	if (count of argv) < 1 then
		error "Usage: osascript import_projekte.applescript <file.pdf|folder> [dest-folder] [timeout-minutes] [--from <ga>]"
	end if
	set srcItem to item 1 of argv
	set destFolder to defaultDestFolder
	set timeoutSeconds to defaultTimeoutSeconds
	set startGaText to ""
	set timeoutWasSet to false
	set argIndex to 2
	repeat while argIndex ≤ (count of argv)
		set arg to item argIndex of argv
		if arg is "--from" or arg is "--ga" then
			set argIndex to argIndex + 1
			if argIndex > (count of argv) then error "--from needs a GA number, for example 104 or 104a."
			set startGaText to item argIndex of argv
			if (startGaText is "GA" or startGaText is "ga") and argIndex < (count of argv) then
				set argIndex to argIndex + 1
				set startGaText to "GA " & (item argIndex of argv)
			end if
		else if arg starts with "--from=" then
			set startGaText to text 8 thru -1 of arg
		else if arg starts with "--ga=" then
			set startGaText to text 6 thru -1 of arg
		else
			set argKind to classifyArg(arg)
			if argKind is "ga" then
				if startGaText is not "" then error "Start GA given twice: " & startGaText & " and " & arg
				set startGaText to arg
			else if argKind is "number" then
				if not timeoutWasSet then
					set timeoutSeconds to (arg as number) * 60
					set timeoutWasSet to true
				else if startGaText is "" then
					set startGaText to arg
				else
					error "Unexpected argument: " & arg
				end if
			else
				set destFolder to arg
			end if
		end if
		set argIndex to argIndex + 1
	end repeat
	if startGaText is "" then
		set startNum to 0
		set startSuffix to ""
	else
		set parsedStart to parseGaSpec(startGaText)
		set startNum to gaNumber of parsedStart
		set startSuffix to gaSuffix of parsedStart
		set startGaText to (startNum as text) & startSuffix
	end if
	if timeoutSeconds ≤ settleSeconds then error "Timeout must be longer than the settle window."
	
	set srcItem to expandUserPath(srcItem)
	set destFolder to expandUserPath(destFolder)
	set destFolder to do shell script "export LANG=en_US.UTF-8; mkdir -p " & quoted form of destFolder & " && cd " & quoted form of destFolder & " && pwd"
	set srcResolved to do shell script "export LANG=en_US.UTF-8; p=" & quoted form of srcItem & "; if [ -d \"$p\" ]; then cd \"$p\" && pwd; elif [ -f \"$p\" ]; then cd \"$(dirname \"$p\")\" && pwd; else echo missing; fi"
	if srcResolved is destFolder then error "Destination folder is the source folder. Refusing to overwrite the original PDFs."
	set logPath to destFolder & "/_import-log.txt"
	
	set sources to listSources(srcItem)
	if sources is {} then error "No PDF files in " & srcItem
	
	set startNote to startGaText
	if startNote is "" then set startNote to "(all)"
	logLine("start files=" & (count of sources) & " dest=" & destFolder & " timeoutMin=" & (timeoutSeconds / 60) & " from=" & startNote)
	set okCount to 0
	set failCount to 0
	set skipCount to 0
	repeat with srcFile in sources
		set srcPosix to srcFile as text
		set baseName to do shell script "export LANG=en_US.UTF-8; basename " & quoted form of srcPosix
		set outPath to exportPath(destFolder, baseName)
		if srcPosix is outPath then error "Export path is the source file: " & srcPosix
		set gaPos to "keep"
		if startGaText is not "" then set gaPos to gaPosition(baseName, startNum, startSuffix)
		if gaPos is not "keep" then
			set skipCount to skipCount + 1
			if gaPos is "nomatch" then
				logLine("skip " & baseName & " not a GA number")
			else
				logLine("skip " & baseName & " before " & startGaText)
			end if
		else if projectBytes(outPath) > 0 then
			set skipCount to skipCount + 1
			logLine("skip " & baseName & " exported")
		else
			try
				importOne(srcPosix, destFolder, baseName, timeoutSeconds)
				set okCount to okCount + 1
				logLine("ok " & baseName)
			on error errMsg
				set failCount to failCount + 1
				logLine("fail " & baseName & " — " & errMsg)
				if accessLost(errMsg) then
					logLine("access lost, waiting")
					if not waitForAssistiveAccess(180) then
						logLine("stop batch, no assistive access")
						error "Stopped after " & baseName & ": osascript hat keine Berechtigung für den Hilfszugriff."
					end if
				end if
				if appNotResponding() then
					logLine("stop batch, FineReader not responding")
					error "Stopped after " & baseName & ": FineReader zeigt Fortfahren / Trotzdem beenden."
				end if
				try
					cancelExportDialog()
					closeWindowNamed("Neuer Task")
					if ownsUntitled then discardUntitled()
				on error closeMsg
					if closeMsg contains "Ungültiger Index" or closeMsg contains "invalid index" or accessLost(closeMsg) then
						logLine("close glitch, continue: " & closeMsg)
					else
						logLine("stop batch, window left open: " & closeMsg)
						error "Stopped after " & baseName & ": " & errMsg & " / close: " & closeMsg
					end if
				end try
			end try
		end if
	end repeat
	set summary to "done ok=" & okCount & " fail=" & failCount & " skip=" & skipCount
	logLine(summary)
	return summary
end run

on listSources(srcItem)
	set srcKind to do shell script "export LANG=en_US.UTF-8; if [ -d " & quoted form of srcItem & " ]; then echo dir; elif [ -f " & quoted form of srcItem & " ]; then echo file; else echo missing; fi"
	if srcKind is "missing" then error "Source does not exist: " & srcItem
	if srcKind is "file" then
		if srcItem does not end with ".pdf" and srcItem does not end with ".PDF" then error "Source is not a PDF: " & srcItem
		return {srcItem}
	end if
	set listing to do shell script "export LANG=en_US.UTF-8; find " & quoted form of srcItem & " -maxdepth 1 -type f -iname '*.pdf' | LC_ALL=C sort"
	if listing is "" then return {}
	return paragraphs of listing
end listSources

on importOne(srcPosix, destFolder, baseName, timeoutSeconds)
	if appNotResponding() then error "FineReader zeigt Fortfahren / Trotzdem beenden."
	set ownsUntitled to false
	set activeUntitledName to ""
	set beforeNames to untitledTitleList()
	set baselineUntitled to count of beforeNames
	activateFineReader()
	sendKeystroke("n", {command down})
	if not waitForImportButton(25) then
		error "Start window button not found: " & importButtonName & ". Buttons: " & frontButtonNames()
	end if
	if not clickImportButton() then error "Could not click " & importButtonName
	
	if not waitForNamedControl(openButtonName, 20) then
		error "Open dialog did not appear. Buttons: " & frontButtonNames()
	end if
	goToFolder(srcPosix)
	-- The new project window is already "Ohne Titel" or "Ohne Titel 2" while the open panel is still up.
	-- Confirm with the Öffnen button whenever that panel is still visible.
	if controlExists(openButtonName) then
		if not clickNamedButton(openButtonName) then error "Open button not found. Buttons: " & frontButtonNames()
		if not waitUntilControlGone(openButtonName, 20) then error "Open dialog stayed open. Buttons: " & frontButtonNames()
	end if
	if not waitForNewUntitled(beforeNames, 30) then error "No new window titled " & untitledMarker & " after opening " & baseName
	set ownsUntitled to true
	logLine("window " & activeUntitledName)
	
	waitUntilRecognized(timeoutSeconds)
	exportSearchablePdf(destFolder, baseName, timeoutSeconds)
	discardUntitled()
end importOne

-- Recognition is finished only when both stay true for settleSeconds:
-- the status text contains neither phase phrase, and Exportieren is enabled.
-- A short empty status between the two phases must not count, so the pair is debounced.
on waitUntilRecognized(timeoutSeconds)
	set deadline to (current date) + timeoutSeconds
	set stableStart to missing value
	set lastBeat to (current date) - 1000
	set accessLostSince to missing value
	repeat
		if (current date) ≥ deadline then
			set snap to readDocumentState()
			error "Recognition timed out. status=" & statusText of snap & " exportEnabled=" & exportEnabled of snap
		end if
		set snap to readDocumentState()
		if accessLost of snap then
			set stableStart to missing value
			logLine("wait access lost, restart System Events")
			if restoreAssistiveAccess() then
				logLine("access restored")
				set accessLostSince to missing value
			else
				if accessLostSince is missing value then set accessLostSince to current date
				if ((current date) - accessLostSince) ≥ 180 then error "osascript hat keine Berechtigung für den Hilfszugriff."
				delay 8
			end if
		else
			set accessLostSince to missing value
		end if
		if windowFound of snap and not (accessLost of snap) then
			set ready to (exportFound of snap) and (exportEnabled of snap) and not (busy of snap)
			if ready then
				if stableStart is missing value then set stableStart to current date
				if ((current date) - stableStart) ≥ settleSeconds then return
			else
				set stableStart to missing value
			end if
			if ((current date) - lastBeat) ≥ 30 then
				logLine("wait status=" & statusText of snap & " export=" & exportEnabled of snap)
				set lastBeat to current date
			end if
		end if
		delay pollSeconds
	end repeat
end waitUntilRecognized

on exportSearchablePdf(destFolder, baseName, timeoutSeconds)
	set outPath to exportPath(destFolder, baseName)
	if projectBytes(outPath) is 0 then
		try
			do shell script "export LANG=en_US.UTF-8; p=" & quoted form of outPath & "; if [ -f \"$p\" ]; then rm \"$p\"; fi"
		end try
	end if
	logLine("export " & baseName)
	activateFineReader()
	focusUntitled()
	set frontName to frontWindowName()
	if not windowIsActiveUntitled(frontName) then error "Front window is \"" & frontName & "\", expected \"" & activeUntitledName & "\"."
	sendKeystroke("e", {command down})
	if not waitForExportWindow(8) then
		if not clickNamedButton(exportButtonName) then error "Export button not found. Buttons: " & frontButtonNames()
	end if
	if not waitForExportWindow(15) then error "Export window did not appear in \"" & frontWindowName() & "\". Buttons: " & frontButtonNames()
	configurePdfExport()
	if not waitForSavePanel(20) then error "Export save dialog did not appear. Buttons: " & frontButtonNames()
	if keepDialogOpen() then
		if not clickKeepDialogDelete() then error "Keep dialog is open and Löschen was not clicked. Buttons: " & frontButtonNames()
		error "Closed the unsaved project with Löschen before the PDF save dialog was ready."
	end if
	set openResult to setOpenAfterSaving(false)
	if openResult is "disabled" then error "Could not turn off Dokument nach dem Speichern öffnen"
	goToFolder(destFolder)
	if not setSaveName(baseName) then error "Could not set the export name field to " & baseName
	if keepDialogOpen() then
		if not clickKeepDialogDelete() then error "Keep dialog is open and Löschen was not clicked. Buttons: " & frontButtonNames()
		error "Closed the unsaved project with Löschen instead of saving an .frdoc."
	end if
	if not clickExportConfirm() then error "Export confirm button not found. Buttons: " & frontButtonNames()
	delay 0.4
	if dialogHasButton("Ersetzen") then error "Export asked to replace an existing file for " & baseName
	waitUntilExported(outPath, timeoutSeconds)
end exportSearchablePdf

on configurePdfExport()
	tell application "System Events"
		tell process appName
			set exportWin to missing value
			repeat with w in windows
				try
					if my windowIsActiveUntitled(name of w as text) then
						set exportWin to w
						try
							perform action "AXRaise" of w
						end try
						try
							set value of attribute "AXMain" of w to true
						end try
						try
							repeat with s in sheets of w
								if my treeHasName(s, nextButtonName, 8) or my treeHasName(s, "Weiter…", 8) then
									set exportWin to s
									exit repeat
								end if
							end repeat
						end try
						exit repeat
					end if
				end try
			end repeat
			if exportWin is missing value then error "Window titled \"" & activeUntitledName & "\" not found."
			if not my treeHasName(exportWin, searchablePdfName, 18) then
				if not my clickExactIn(exportWin, "PDF", 18) then error "PDF format tab not found. Buttons: " & my frontButtonNames()
				delay 0.35
			end if
			if not my selectRadioIn(exportWin, searchablePdfName, 18) then error "Option not found: " & searchablePdfName & ". Buttons: " & my frontButtonNames()
			if not my selectPopupIn(exportWin, layoutItemName, 18) then error "Layout not found: " & layoutItemName & ". Buttons: " & my frontButtonNames()
			if my setCheckboxIn(exportWin, keepPicturesName, true, 18) is not "ok" then error "Could not turn on " & keepPicturesName
			delay 0.2
			if not my selectPopupIn(exportWin, qualityItemName, 18) then error "Image quality not found: " & qualityItemName
			if my setCheckboxIn(exportWin, mrcName, false, 18) is not "ok" then error "Could not turn off " & mrcName
			if my setCheckboxIn(exportWin, keepHeadersName, true, 18) is not "ok" then error "Could not turn on " & keepHeadersName
			set colorResult to my setCheckboxIn(exportWin, keepColorsName, false, 18)
			if colorResult is "missing" then error "Option not found: " & keepColorsName
			if colorResult is "disabled" then error keepColorsName & " is on and disabled."
			if my setCheckboxIn(exportWin, pdfaName, false, 18) is not "ok" then error "Could not turn off " & pdfaName
			if my setCheckboxIn(exportWin, pdfuaName, false, 18) is not "ok" then error "Could not turn off " & pdfuaName
			if not my clickInElement(exportWin, nextButtonName, 12) then
				if not my clickInElement(exportWin, "Weiter…", 12) then error "Next button not found. Buttons: " & my frontButtonNames()
			end if
		end tell
	end tell
	logLine("export next")
end configurePdfExport

on waitUntilExported(outPath, timeoutSeconds)
	set deadline to (current date) + timeoutSeconds
	set stableStart to missing value
	set lastSize to ""
	set lastBeat to (current date) - 1000
	repeat
		if (current date) ≥ deadline then error "Export timed out. bytes=" & fileByteText(outPath) & " path=" & outPath
		if dialogHasButton("Ersetzen") then error "Export asked to replace an existing file: " & outPath
		set n to fileByteText(outPath)
		set busy to exportStillRunning()
		if n is not "0" and n is not "" and n is lastSize and not busy then
			if stableStart is missing value then set stableStart to current date
			if ((current date) - stableStart) ≥ settleSeconds then return
		else
			set stableStart to missing value
		end if
		set lastSize to n
		if ((current date) - lastBeat) ≥ 30 then
			logLine("export bytes=" & n & " busy=" & busy)
			set lastBeat to current date
		end if
		delay pollSeconds
	end repeat
end waitUntilExported

on exportStillRunning()
	if exportWindowOpen() then return true
	if controlExists("Neuer Ordner") then return true
	if staticTextHasInWindows("Sichern unter") then return true
	return staticTextHasInWindows(exportingPhase)
end exportStillRunning

on waitForSavePanel(maxSeconds)
	set deadline to (current date) + maxSeconds
	repeat
		if controlExists("Neuer Ordner") or staticTextHasInWindows("Sichern unter") then return true
		if (current date) ≥ deadline then return false
		delay 0.3
	end repeat
end waitForSavePanel

-- The save panel's confirm button is "Exportieren". The document toolbar has the
-- same name, so only a control next to "Neuer Ordner" counts, never the toolbar.
on clickExportConfirm()
	tell application "System Events"
		if not (exists process appName) then return false
		tell process appName
			repeat with w in windows
				try
					repeat with s in sheets of w
						if my treeHasName(s, "Neuer Ordner", 12) then
							if my clickInElement(s, exportButtonName, 12) then return true
							if my clickInElement(s, saveButtonName, 12) then return true
						end if
					end repeat
				end try
				try
					if my clickExportConfirmIn(w, 18) then return true
				end try
			end repeat
		end tell
	end tell
	return false
end clickExportConfirm

on clickExportConfirmIn(el, depthLeft)
	if depthLeft ≤ 0 then return false
	set elRole to safeAttr(el, "role")
	if elRole is "AXToolbar" or elRole is "AXMenuBar" then return false
	if {"AXScrollArea", "AXList", "AXOutline", "AXTable", "AXBrowser", "AXWebArea"} contains elRole then return false
	if elRole is not "AXWindow" then
		if treeHasName(el, "Neuer Ordner", 8) and not treeHasName(el, "OCR-Sprachen", 6) then
			if clickInElement(el, exportButtonName, 8) then return true
			if clickInElement(el, saveButtonName, 8) then return true
		end if
	end if
	repeat with k in childElements(el)
		if clickExportConfirmIn(contents of k, depthLeft - 1) then return true
	end repeat
	return false
end clickExportConfirmIn

on waitForExportWindow(maxSeconds)
	set deadline to (current date) + maxSeconds
	repeat
		if exportWindowOpen() then return true
		if (current date) ≥ deadline then return false
		delay 0.3
	end repeat
end waitForExportWindow

on exportWindowOpen()
	tell application "System Events"
		if not (exists process appName) then return false
		tell process appName
			repeat with w in windows
				try
					if my windowIsActiveUntitled(name of w as text) then
						if my treeHasName(w, nextButtonName, 8) or my treeHasName(w, "Weiter…", 8) then return true
						try
							repeat with s in sheets of w
								if my treeHasName(s, nextButtonName, 8) or my treeHasName(s, "Weiter…", 8) then return true
							end repeat
						end try
					end if
				end try
			end repeat
		end tell
	end tell
	return false
end exportWindowOpen

on cancelExportDialog()
	if clickKeepDialogDelete() then
		delay 0.4
		return
	end if
	if not exportWindowOpen() and not controlExists(nextButtonName) and not controlExists(saveButtonName) then return
	activateFineReader()
	tell application "System Events" to keystroke "." using {command down}
	delay 0.35
	if clickKeepDialogDelete() then return
	if exportWindowOpen() or controlExists(nextButtonName) or controlExists(saveButtonName) then
		clickNamedButton(cancelButtonName)
		delay 0.35
	end if
end cancelExportDialog

-- Close only the untitled window opened for this file. An older "Ohne Titel"
-- or "Ohne Titel 2" that was already open stays open.
on discardUntitled()
	if activeUntitledName is "" then return
	repeat with attempt from 1 to 4
		if keepDialogOpen() then
			if not clickKeepDialogDelete() then error "Keep dialog is open and Löschen was not clicked. Buttons: " & frontButtonNames()
			delay 0.5
		else if saveChangesButtonNames() is not "" then
			if not clickDiscardButton() then
				error "Save-changes dialog still open. Buttons: " & saveChangesButtonNames() & ". Update discardButtonName from the dump."
			end if
			delay 0.4
		end if
		if not activeUntitledOpen() then return
		activateFineReader()
		focusUntitled()
		sendKeystroke("w", {command down})
		delay 0.6
	end repeat
	if keepDialogOpen() then
		if not clickKeepDialogDelete() then error "Keep dialog is open and Löschen was not clicked. Buttons: " & frontButtonNames()
		delay 0.5
	end if
	if activeUntitledOpen() then error "Document window still open (" & activeUntitledName & ")"
	if keepDialogOpen() or saveChangesButtonNames() is not "" then error "Save-changes dialog still open. Buttons: " & frontButtonNames()
end discardUntitled

on setOpenAfterSaving(shouldBeOn)
	set found to "missing"
	tell application "System Events"
		if not (exists process appName) then return found
		tell process appName
			repeat with w in windows
				set oneResult to my setCheckboxIn(w, openAfterFragment, shouldBeOn, 14)
				if oneResult is not "missing" then set found to oneResult
				try
					repeat with s in sheets of w
						set oneResult to my setCheckboxIn(s, openAfterFragment, shouldBeOn, 10)
						if oneResult is not "missing" then set found to oneResult
					end repeat
				end try
			end repeat
		end tell
	end tell
	return found
end setOpenAfterSaving

on expandUserPath(rawPath)
	return do shell script "export LANG=en_US.UTF-8
p=" & quoted form of rawPath & "
case \"$p\" in
  '~'/*) p=\"$HOME/${p#'~/'}\" ;;
  '~') p=\"$HOME\" ;;
esac
printf '%s' \"$p\""
end expandUserPath

on closeDocument(baseName)
	activateFineReader()
	focusWindowTitled(baseName, untitledMarker)
	sendKeystroke("w", {command down})
	delay 0.5
end closeDocument

-- Cmd+W has already been sent. Dismiss a save-changes sheet, then repeat until the
-- document window is gone. Never click "Sichern" or "Abbrechen" here.
on ensureClosed(baseName)
	repeat with attempt from 1 to 4
		set sheetButtons to saveChangesButtonNames()
		if sheetButtons is not "" then
			if not clickDiscardButton() then
				error "Save-changes dialog still open. Buttons: " & sheetButtons & ". Update discardButtonName from the dump."
			end if
			delay 0.4
		end if
		if not documentStillOpen(baseName) then return
		activateFineReader()
		focusWindowTitled(baseName, untitledMarker)
		sendKeystroke("w", {command down})
		delay 0.6
	end repeat
	if documentStillOpen(baseName) then error "Document window still open for " & baseName
	set sheetButtons to saveChangesButtonNames()
	if sheetButtons is not "" then error "Save-changes dialog still open. Buttons: " & sheetButtons
end ensureClosed

on goToFolder(posixPath)
	activateFineReader()
	sendKeystroke("g", {command down, shift down})
	delay 0.45
	if not goToSheetOpen() then error "Go to Folder sheet did not open (Cmd+Shift+G)."
	pasteText(posixPath)
	delay 0.15
	sendKeystroke(return, {})
	delay 0.5
end goToFolder

on exportPath(destFolder, baseName)
	if baseName ends with ".pdf" then return destFolder & "/" & baseName
	return destFolder & "/" & baseName & ".pdf"
end exportPath

on classifyArg(arg)
	if arg contains "/" or arg starts with "." or arg starts with "~" then return "path"
	try
		arg as number
		return "number"
	end try
	try
		parseGaSpec(arg)
		return "ga"
	end try
	return "path"
end classifyArg

on parseGaSpec(spec)
	set t to spec as text
	if t ends with ".pdf" then set t to text 1 thru -5 of t
	set t to normalizeUIText(t)
	ignoring case
		if t starts with "GA " then set t to text 4 thru -1 of t
		if t starts with "GA" then set t to text 3 thru -1 of t
	end ignoring
	set t to normalizeUIText(t)
	if t is "" then error "Not a GA number: " & spec
	set numText to ""
	set suffix to ""
	repeat with i from 1 to (length of t)
		set ch to character i of t
		if "0123456789" contains ch then
			if suffix is not "" then error "Not a GA number: " & spec
			set numText to numText & ch
		else
			if suffix is not "" then error "Not a GA number: " & spec
			set suffix to toLower(ch)
			if "abcdefghijklmnopqrstuvwxyz" does not contain suffix then error "Not a GA number: " & spec
		end if
	end repeat
	if numText is "" then error "Not a GA number: " & spec
	return {gaNumber:numText as integer, gaSuffix:suffix}
end parseGaSpec

on gaPosition(baseName, startNum, startSuffix)
	try
		set parsed to parseGaSpec(baseName)
	on error
		return "nomatch"
	end try
	set fileNum to gaNumber of parsed
	set fileSuffix to gaSuffix of parsed
	if fileNum < startNum then return "before"
	if fileNum > startNum then return "keep"
	if startSuffix is "" then return "keep"
	if fileSuffix ≥ startSuffix then return "keep"
	return "before"
end gaPosition

on toLower(sourceText)
	set lowerChars to "abcdefghijklmnopqrstuvwxyz"
	set upperChars to "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	set outText to ""
	repeat with i from 1 to (length of sourceText)
		set ch to character i of sourceText
		set p to offset of ch in upperChars
		if p > 0 then
			set outText to outText & character p of lowerChars
		else
			set outText to outText & ch
		end if
	end repeat
	return outText
end toLower

on clickExactIn(el, wanted, depthLeft)
	if depthLeft ≤ 0 then return false
	set elRole to safeAttr(el, "role")
	if {"AXButton", "AXRadioButton", "AXTab", "AXCheckBox", "AXMenuButton"} contains elRole then
		if namesMatch(safeAttr(el, "name"), wanted) then
			tell application "System Events" to click el
			return true
		end if
	end if
	if {"AXScrollArea", "AXList", "AXOutline", "AXTable", "AXWebArea", "AXBrowser"} contains elRole then return false
	repeat with k in childElements(el)
		if clickExactIn(contents of k, wanted, depthLeft - 1) then return true
	end repeat
	return false
end clickExactIn

on selectRadioIn(el, wanted, depthLeft)
	if depthLeft ≤ 0 then return false
	set elRole to safeAttr(el, "role")
	if elRole is "AXRadioButton" and namesMatch(safeAttr(el, "name"), wanted) then
		if not checkboxIsOn(el) then
			tell application "System Events" to click el
			delay 0.15
		end if
		return true
	end if
	if {"AXScrollArea", "AXList", "AXOutline", "AXTable", "AXWebArea", "AXBrowser"} contains elRole then return false
	repeat with k in childElements(el)
		if selectRadioIn(contents of k, wanted, depthLeft - 1) then return true
	end repeat
	return false
end selectRadioIn

on selectPopupIn(el, wanted, depthLeft)
	if popupValueIs(el, wanted, depthLeft) then return true
	return choosePopupItem(el, wanted, depthLeft, false)
end selectPopupIn

on popupValueIs(el, wanted, depthLeft)
	if depthLeft ≤ 0 then return false
	if safeAttr(el, "role") is "AXPopUpButton" then
		set blob to normalizeUIText(safeAttr(el, "name") & " " & safeAttr(el, "description") & " " & safeValue(el))
		if blob contains normalizeUIText(wanted) then return true
	end if
	if {"AXScrollArea", "AXList", "AXOutline", "AXTable", "AXWebArea", "AXBrowser"} contains safeAttr(el, "role") then return false
	repeat with k in childElements(el)
		if popupValueIs(contents of k, wanted, depthLeft - 1) then return true
	end repeat
	return false
end popupValueIs

on choosePopupItem(el, wanted, depthLeft, openUnknown)
	if depthLeft ≤ 0 then return false
	set elRole to safeAttr(el, "role")
	if elRole is "AXPopUpButton" and elementEnabled(el) then
		set offers to popupOffers(el, wanted)
		if offers or openUnknown then
			tell application "System Events" to click el
			delay 0.35
			if clickPopupItem(el, wanted) then return true
			dismissOpenMenu()
		end if
	end if
	if {"AXScrollArea", "AXList", "AXOutline", "AXTable", "AXWebArea", "AXBrowser"} contains elRole then return false
	repeat with k in childElements(el)
		if choosePopupItem(contents of k, wanted, depthLeft - 1, openUnknown) then return true
	end repeat
	return false
end choosePopupItem

on popupOffers(popupEl, wanted)
	tell application "System Events"
		try
			repeat with mi in menu items of menu 1 of popupEl
				if my namesMatch(name of mi as text, wanted) then return true
			end repeat
		end try
	end tell
	return false
end popupOffers

on clickPopupItem(popupEl, wanted)
	tell application "System Events"
		try
			repeat with mi in menu items of menu 1 of popupEl
				if my namesMatch(name of mi as text, wanted) then
					click mi
					delay 0.15
					return true
				end if
			end repeat
		end try
		tell process appName
			repeat with w in windows
				try
					if (role of w as text) is "AXMenu" then
						repeat with mi in menu items of w
							if my namesMatch(name of mi as text, wanted) then
								click mi
								delay 0.15
								return true
							end if
						end repeat
					end if
				end try
			end repeat
		end tell
	end tell
	return false
end clickPopupItem

on dismissOpenMenu()
	set menuOpen to false
	tell application "System Events"
		tell process appName
			repeat with w in windows
				try
					if (role of w as text) is "AXMenu" then set menuOpen to true
				end try
			end repeat
		end tell
	end tell
	if menuOpen then
		tell application "System Events" to key code 53
		delay 0.15
	end if
end dismissOpenMenu

on setCheckboxIn(el, fragment, shouldBeOn, depthLeft)
	if depthLeft ≤ 0 then return "missing"
	set elRole to safeAttr(el, "role")
	if elRole is "AXCheckBox" then
		set boxName to normalizeUIText(safeAttr(el, "name"))
		if boxName contains normalizeUIText(fragment) then
			if checkboxIsOn(el) is shouldBeOn then return "ok"
			if not elementEnabled(el) then return "disabled"
			tell application "System Events" to click el
			delay 0.12
			return "ok"
		end if
	end if
	if {"AXScrollArea", "AXList", "AXOutline", "AXTable", "AXWebArea", "AXBrowser"} contains elRole then return "missing"
	repeat with k in childElements(el)
		set childResult to setCheckboxIn(contents of k, fragment, shouldBeOn, depthLeft - 1)
		if childResult is not "missing" then return childResult
	end repeat
	return "missing"
end setCheckboxIn

on checkboxIsOn(el)
	tell application "System Events"
		try
			set v to value of el
			if v is missing value then return false
			if v is true or v is 1 then return true
		end try
	end tell
	return false
end checkboxIsOn

on staticTextHasInWindows(fragment)
	tell application "System Events"
		if not (exists process appName) then return false
		tell process appName
			repeat with i from 1 to (count of windows)
				if my staticTextHas(window i, fragment, 8) then return true
			end repeat
		end tell
	end tell
	return false
end staticTextHasInWindows

on staticTextHas(el, fragment, depthLeft)
	if depthLeft ≤ 0 then return false
	set elRole to safeAttr(el, "role")
	if elRole is "AXStaticText" or elRole is "AXTextField" then
		set blob to normalizeUIText(safeAttr(el, "name") & " " & safeValue(el))
		if blob contains normalizeUIText(fragment) then return true
	end if
	if {"AXScrollArea", "AXList", "AXOutline", "AXTable", "AXWebArea", "AXBrowser"} contains elRole then return false
	repeat with k in childElements(el)
		if staticTextHas(contents of k, fragment, depthLeft - 1) then return true
	end repeat
	return false
end staticTextHas

on setSaveName(projectName)
	tell application "System Events"
		if not (exists process appName) then return false
		tell process appName
			repeat with i from 1 to (count of windows)
				if my writeSaveName(window i, projectName, 12) then return true
				try
					repeat with s in sheets of window i
						if my writeSaveName(s, projectName, 8) then return true
					end repeat
				end try
			end repeat
		end tell
	end tell
	return false
end setSaveName

-- The PDF export name field is nested in the save panel ("Sichern unter:").
-- The keep-project sheet uses the same label with value "Ohne Titel.frdoc"; that field is left alone.
on writeSaveName(el, projectName, depthLeft)
	if depthLeft ≤ 0 then return false
	set elRole to safeAttr(el, "role")
	if {"AXScrollArea", "AXList", "AXOutline", "AXTable", "AXBrowser"} contains elRole then return false
	if elRole is "AXTextField" or elRole is "AXComboBox" then
		set fieldName to safeAttr(el, "name")
		set fieldValue to safeValue(el)
		set fieldDesc to safeAttr(el, "description")
		-- "Ohne Titel.frdoc" is the keep-project sheet. Never type the PDF name there
		-- and never confirm it with Sichern; that sheet is dismissed with Löschen.
		if fieldValue ends with ".frdoc" then
			set isNameField to false
		else
			set isNameField to false
			if fieldName contains "Sichern unter" or fieldDesc contains "Sichern unter" then set isNameField to true
			if fieldValue contains untitledMarker or fieldValue ends with ".pdf" then set isNameField to true
		end if
		if isNameField then
			tell application "System Events"
				try
					set focused of el to true
				end try
				try
					click el
				end try
				try
					set value of el to projectName
				end try
				try
					if (value of el as text) is projectName then return true
				end try
			end tell
			sendKeystroke("a", {command down})
			delay 0.1
			pasteText(projectName)
			delay 0.25
			tell application "System Events"
				try
					set got to value of el as text
					if got is projectName then return true
					if got contains projectName then return true
				end try
			end tell
			return false
		end if
	end if
	repeat with k in childElements(el)
		if writeSaveName(contents of k, projectName, depthLeft - 1) then return true
	end repeat
	return false
end writeSaveName

on clickImportButton()
	if clickNamedButton(importButtonName) then return true
	if clickByRolePath(importButtonPath) then return true
	return clickContaining(importButtonName)
end clickImportButton

on clickNamedButton(wanted)
	tell application "System Events"
		tell process appName
			repeat with w in windows
				try
					if my clickInElement(w, wanted, 16) then return true
				end try
				try
					repeat with s in sheets of w
						if my clickInElement(s, wanted, 20) then return true
					end repeat
				end try
			end repeat
		end tell
	end tell
	return false
end clickNamedButton

on clickInElement(el, wanted, depthLeft)
	if depthLeft ≤ 0 then return false
	set elRole to safeAttr(el, "role")
	if elRole is "AXButton" or elRole is "AXMenuButton" or elRole is "AXCheckBox" then
		if namesMatch(safeAttr(el, "name"), wanted) then
			tell application "System Events" to click el
			return true
		end if
	end if
	if {"AXScrollArea", "AXList", "AXOutline", "AXTable", "AXWebArea"} contains elRole then return false
	repeat with k in childElements(el)
		if clickInElement(contents of k, wanted, depthLeft - 1) then return true
	end repeat
	return false
end clickInElement

on clickContaining(wanted)
	tell application "System Events"
		tell process appName
			repeat with i from 1 to (count of windows)
				if my clickLoose(window i, wanted, 10) then return true
			end repeat
		end tell
	end tell
	return false
end clickContaining

on clickLoose(el, wanted, depthLeft)
	if depthLeft ≤ 0 then return false
	set blob to normalizeUIText(safeAttr(el, "name") & " " & safeAttr(el, "description") & " " & safeValue(el))
	if blob contains normalizeUIText(wanted) then
		set elRole to safeAttr(el, "role")
		if {"AXButton", "AXMenuButton", "AXCheckBox", "AXStaticText", "AXLink", "AXGroup", "AXCell"} contains elRole then
			try
				tell application "System Events" to click el
				return true
			end try
		end if
	end if
	if {"AXScrollArea", "AXList", "AXOutline", "AXTable", "AXWebArea"} contains safeAttr(el, "role") then return false
	repeat with k in childElements(el)
		if clickLoose(contents of k, wanted, depthLeft - 1) then return true
	end repeat
	return false
end clickLoose

on clickByRolePath(rolePath)
	if rolePath is {} then return false
	tell application "System Events"
		tell process appName
			set currentEl to window 1
			repeat with roleName in rolePath
				set nxt to missing value
				try
					repeat with k in (UI elements of currentEl)
						if my safeAttr(k, "role") is (roleName as text) then
							set nxt to contents of k
							exit repeat
						end if
					end repeat
				end try
				if nxt is missing value then return false
				set currentEl to nxt
			end repeat
			click currentEl
			return true
		end tell
	end tell
end clickByRolePath

on clickKeepDialogDelete()
	tell application "System Events"
		if not (exists process appName) then return false
		tell process appName
			repeat with i from 1 to (count of windows)
				try
					repeat with s in sheets of window i
						if my treeTextContains(s, "dieses neue Dokument", 16) then
							if my clickInElement(s, discardButtonName, 20) then return true
						end if
					end repeat
				end try
			end repeat
		end tell
	end tell
	return false
end clickKeepDialogDelete

on keepDialogOpen()
	tell application "System Events"
		if not (exists process appName) then return false
		tell process appName
			repeat with i from 1 to (count of windows)
				try
					repeat with s in sheets of window i
						if my treeTextContains(s, "dieses neue Dokument", 16) then return true
					end repeat
				end try
			end repeat
		end tell
	end tell
	return false
end keepDialogOpen

on treeTextContains(el, fragment, depthLeft)
	if depthLeft ≤ 0 then return false
	set blob to normalizeUIText(safeAttr(el, "name") & " " & safeValue(el))
	if blob contains normalizeUIText(fragment) then return true
	set elRole to safeAttr(el, "role")
	if {"AXScrollArea", "AXList", "AXOutline", "AXTable", "AXBrowser", "AXWebArea"} contains elRole then return false
	repeat with k in childElements(el)
		if treeTextContains(contents of k, fragment, depthLeft - 1) then return true
	end repeat
	return false
end treeTextContains

on clickDiscardButton()
	if clickKeepDialogDelete() then return true
	if clickNamedButton(discardButtonName) then return true
	repeat with candidate in discardFallbacks
		if (candidate as text) is not discardButtonName then
			if clickNamedButton(candidate as text) then return true
		end if
	end repeat
	return false
end clickDiscardButton

on waitForImportButton(maxSeconds)
	set deadline to (current date) + maxSeconds
	repeat
		if controlExists(importButtonName) then return true
		if (current date) ≥ deadline then return false
		delay 0.4
	end repeat
end waitForImportButton

on waitUntilControlGone(wanted, maxSeconds)
	set deadline to (current date) + maxSeconds
	repeat
		if not controlExists(wanted) then return true
		if (current date) ≥ deadline then return false
		delay 0.3
	end repeat
end waitUntilControlGone

on waitForNamedControl(wanted, maxSeconds)
	set deadline to (current date) + maxSeconds
	repeat
		if controlExists(wanted) then return true
		if (current date) ≥ deadline then return false
		delay 0.3
	end repeat
end waitForNamedControl

on waitForUntitled(maxSeconds)
	set deadline to (current date) + maxSeconds
	repeat
		if untitledStillOpen() then return true
		if (current date) ≥ deadline then return false
		delay 0.4
	end repeat
end waitForUntitled

on controlExists(wanted)
	tell application "System Events"
		if not (exists process appName) then return false
		tell process appName
			repeat with i from 1 to (count of windows)
				if my treeHasName(window i, wanted, 10) then return true
				try
					repeat with s in sheets of window i
						if my treeHasName(s, wanted, 6) then return true
					end repeat
				end try
			end repeat
		end tell
	end tell
	return false
end controlExists

on treeHasName(el, wanted, depthLeft)
	if depthLeft ≤ 0 then return false
	if namesMatch(safeAttr(el, "name"), wanted) then return true
	if {"AXScrollArea", "AXList", "AXOutline", "AXTable", "AXWebArea"} contains safeAttr(el, "role") then return false
	repeat with k in childElements(el)
		if treeHasName(contents of k, wanted, depthLeft - 1) then return true
	end repeat
	return false
end treeHasName

on accessLost(errMsg)
	set t to errMsg as text
	return t contains "Hilfszugriff" or t contains "assistive access" or t contains "Assistive Access"
end accessLost

on uiCallFailed(errMsg, errNum)
	if errNum is -1712 then return true
	return accessLost(errMsg)
end uiCallFailed

on assistiveAccessWorks()
	try
		with timeout of 15 seconds
			tell application "System Events"
				tell process appName
					set windowCount to count of windows
				end tell
			end tell
		end timeout
		return true
	on error errMsg number errNum
		if errNum is -1712 then return false
		return not accessLost(errMsg)
	end try
end assistiveAccessWorks

on restartSystemEvents()
	try
		do shell script "killall 'System Events' >/dev/null 2>&1 || true"
	end try
	delay 1.5
end restartSystemEvents

on restoreAssistiveAccess()
	restartSystemEvents()
	return assistiveAccessWorks()
end restoreAssistiveAccess

on waitForAssistiveAccess(maxSeconds)
	set deadline to (current date) + maxSeconds
	repeat
		if assistiveAccessWorks() then return true
		logLine("restart System Events")
		if restoreAssistiveAccess() then
			logLine("access restored")
			return true
		end if
		if (current date) ≥ deadline then return false
		delay 5
	end repeat
end waitForAssistiveAccess

on appNotResponding()
	try
		return controlExists("Trotzdem beenden") and controlExists("Fortfahren")
	on error
		return false
	end try
end appNotResponding

on readDocumentState()
	set blob to ""
	set expFound to false
	set expOn to false
	set foundWindow to false
	try
		with timeout of 20 seconds
			tell application "System Events"
				if not (exists process appName) then
					return {busy:true, exportEnabled:false, exportFound:false, statusText:"", windowFound:false, accessLost:false}
				end if
				tell process appName
					repeat with i from 1 to (count of windows)
						try
							if my windowIsActiveUntitled(name of window i as text) then
								set foundWindow to true
								set walked to my walkStatus(window i, 8)
								set blob to blob & item 1 of walked
								if item 2 of walked then set expFound to true
								if item 3 of walked then set expOn to true
								exit repeat
							end if
						end try
					end repeat
				end tell
			end tell
		end timeout
	on error errMsg number errNum
		if uiCallFailed(errMsg, errNum) then return {busy:true, exportEnabled:false, exportFound:false, statusText:"(no access)", windowFound:false, accessLost:true}
		error errMsg
	end try
	set statusMsg to ""
	if foundWindow then set statusMsg to normalizeUIText(blob)
	set isBusy to (statusMsg contains phaseAdd) or (statusMsg contains phaseRecognize)
	if statusMsg is "" then set statusMsg to "(empty)"
	return {busy:isBusy, exportEnabled:expOn, exportFound:expFound, statusText:statusMsg, windowFound:foundWindow, accessLost:false}
end readDocumentState

-- Returns {text blob, export found, export enabled}. Skips page lists.
-- The warning badge in phase 2 is included in the text and then ignored.
on walkStatus(el, depthLeft)
	set blob to ""
	set expFound to false
	set expOn to false
	set elRole to safeAttr(el, "role")
	if {"AXScrollArea", "AXList", "AXOutline", "AXTable", "AXWebArea", "AXImage"} contains elRole then
		return {blob, expFound, expOn}
	end if
	set elName to safeAttr(el, "name")
	set elValue to safeValue(el)
	-- The toolbar command "Seiten hinzufügen" is always present. Only the status
	-- field's text counts as a recognition phase.
	if {"AXStaticText", "AXTextField", "AXGroup"} contains elRole then
		set nameNorm to normalizeUIText(elName)
		set valueNorm to normalizeUIText(elValue)
		if valueNorm contains phaseAdd or valueNorm contains phaseRecognize or valueNorm contains "OCR" or valueNorm contains "erstellt" then
			set blob to blob & valueNorm & linefeed
		end if
		if nameNorm contains phaseAdd or nameNorm contains phaseRecognize or nameNorm contains "OCR" or nameNorm contains "erstellt" then
			set blob to blob & nameNorm & linefeed
		end if
	else if elRole is "AXButton" or elRole is "AXMenuButton" or elRole is "AXPopUpButton" or elRole is "AXCheckBox" then
		if elName is exportButtonName or elName starts with exportButtonName then
			set expFound to true
			set expOn to elementEnabled(el)
		end if
		return {blob, expFound, expOn}
	end if
	if depthLeft ≤ 0 then return {blob, expFound, expOn}
	repeat with k in childElements(el)
		set childWalk to walkStatus(contents of k, depthLeft - 1)
		set blob to blob & item 1 of childWalk
		if item 2 of childWalk then set expFound to true
		if item 3 of childWalk then set expOn to true
	end repeat
	return {blob, expFound, expOn}
end walkStatus

on oneLineStatus(blob)
	set picked to ""
	repeat with para in paragraphs of blob
		set lineText to para as text
		if lineText contains phaseAdd or lineText contains phaseRecognize or lineText is "Status" then
			if lineText is not "" then set picked to picked & lineText & " | "
		end if
	end repeat
	if picked is "" then return "(empty)"
	return picked
end oneLineStatus

on untitledStillOpen()
	return untitledCount() > 0
end untitledStillOpen

on untitledCount()
	set n to 0
	tell application "System Events"
		if not (exists process appName) then return 0
		tell process appName
			repeat with w in windows
				try
					if my isUntitledName(name of w as text) then set n to n + 1
				end try
			end repeat
		end tell
	end tell
	return n
end untitledCount

on closeWindowNamed(fragment)
	if not windowTitleExists(fragment) then return
	activateFineReader()
	focusWindowTitled(fragment, fragment)
	sendKeystroke("w", {command down})
	delay 0.4
end closeWindowNamed

on namesMatch(actual, wanted)
	return normalizeUIText(actual) is normalizeUIText(wanted)
end namesMatch

on normalizeUIText(sourceText)
	set sourceText to replaceText(sourceText, character id 8232, " ")
	set sourceText to replaceText(sourceText, character id 8233, " ")
	set sourceText to replaceText(sourceText, return, " ")
	set sourceText to replaceText(sourceText, linefeed, " ")
	set sourceText to replaceText(sourceText, tab, " ")
	set previousDelimiters to AppleScript's text item delimiters
	set AppleScript's text item delimiters to " "
	set kept to {}
	repeat with part in text items of sourceText
		if (part as text) is not "" then set end of kept to part as text
	end repeat
	set AppleScript's text item delimiters to " "
	set sourceText to kept as text
	set AppleScript's text item delimiters to previousDelimiters
	return sourceText
end normalizeUIText

on replaceText(sourceText, searchText, replaceWith)
	set previousDelimiters to AppleScript's text item delimiters
	set AppleScript's text item delimiters to searchText
	set parts to text items of sourceText
	set AppleScript's text item delimiters to replaceWith
	set sourceText to parts as text
	set AppleScript's text item delimiters to previousDelimiters
	return sourceText
end replaceText

on isUntitledName(winTitle)
	return canonicalUntitledName(winTitle) is not ""
end isUntitledName

-- "Ohne Titel", "Ohne Titel 2", and the same titles with a trailing "Bearbeitet".
on canonicalUntitledName(winTitle)
	set t to stripEditedSuffix(normalizeUIText(winTitle))
	if t is untitledMarker then return t
	set namePrefix to untitledMarker & " "
	if t starts with namePrefix then
		set rest to text ((length of namePrefix) + 1) thru -1 of t
		if isAllDigits(rest) then return t
	end if
	return ""
end canonicalUntitledName

on stripEditedSuffix(sourceText)
	set t to sourceText
	set suffixes to {" " & character id 8212 & " Bearbeitet", " " & character id 8211 & " Bearbeitet", " - Bearbeitet", " Bearbeitet"}
	repeat with suffix in suffixes
		set suffixText to suffix as text
		if t ends with suffixText and (length of t) > (length of suffixText) then
			set t to text 1 thru ((length of t) - (length of suffixText)) of t
			exit repeat
		end if
	end repeat
	return normalizeUIText(t)
end stripEditedSuffix

on isAllDigits(sourceText)
	if sourceText is "" then return false
	repeat with c in characters of sourceText
		set ch to c as text
		if ch < "0" or ch > "9" then return false
	end repeat
	return true
end isAllDigits

on windowIsActiveUntitled(winTitle)
	set canon to canonicalUntitledName(winTitle)
	if canon is "" then return false
	if activeUntitledName is "" then return true
	return canon is activeUntitledName
end windowIsActiveUntitled

on untitledTitleList()
	set foundNames to {}
	tell application "System Events"
		if not (exists process appName) then return foundNames
		tell process appName
			repeat with w in windows
				try
					set canon to my canonicalUntitledName(name of w as text)
					if canon is not "" then set end of foundNames to canon
				end try
			end repeat
		end tell
	end tell
	return foundNames
end untitledTitleList

on firstNewUntitled(beforeNames)
	tell application "System Events"
		if not (exists process appName) then return ""
		tell process appName
			repeat with w in windows
				try
					set canon to my canonicalUntitledName(name of w as text)
					if canon is not "" and beforeNames does not contain canon then return canon
				end try
			end repeat
		end tell
	end tell
	return ""
end firstNewUntitled

on waitForNewUntitled(beforeNames, maxSeconds)
	set deadline to (current date) + maxSeconds
	repeat
		set found to firstNewUntitled(beforeNames)
		if found is not "" then
			set activeUntitledName to found
			return true
		end if
		if (current date) ≥ deadline then return false
		delay 0.4
	end repeat
end waitForNewUntitled

on activeUntitledOpen()
	if activeUntitledName is "" then return false
	tell application "System Events"
		if not (exists process appName) then return false
		tell process appName
			repeat with w in windows
				try
					if my canonicalUntitledName(name of w as text) is activeUntitledName then return true
				end try
			end repeat
		end tell
	end tell
	return false
end activeUntitledOpen

on frontWindowName()
	tell application "System Events"
		if not (exists process appName) then return ""
		tell process appName
			try
				return name of window 1 as text
			end try
		end tell
	end tell
	return ""
end frontWindowName

on documentStillOpen(baseName)
	if untitledStillOpen() then return true
	if baseName ends with ".pdf" then
		set stem to text 1 thru -5 of baseName
		if windowTitleExists(stem) then return true
	end if
	return windowTitleExists(baseName)
end documentStillOpen

on windowTitleExists(fragment)
	tell application "System Events"
		if not (exists process appName) then return false
		tell process appName
			repeat with w in windows
				try
					if (name of w as text) contains fragment then return true
				end try
			end repeat
		end tell
	end tell
	return false
end windowTitleExists

on focusUntitled()
	tell application "System Events"
		tell process appName
			repeat with w in windows
				try
					if my windowIsActiveUntitled(name of w as text) then
						try
							perform action "AXRaise" of w
						end try
						try
							set value of attribute "AXMain" of w to true
						end try
						return
					end if
				end try
			end repeat
		end tell
	end tell
end focusUntitled

on focusWindowTitled(fragmentA, fragmentB)
	tell application "System Events"
		tell process appName
			repeat with i from 1 to (count of windows)
				try
					set winTitle to name of window i as text
					if winTitle contains fragmentA or winTitle contains fragmentB then
						try
							perform action "AXRaise" of window i
						end try
						try
							set value of attribute "AXMain" of window i to true
						end try
						return
					end if
				end try
			end repeat
		end tell
	end tell
end focusWindowTitled

on goToSheetOpen()
	tell application "System Events"
		tell process appName
			try
				if (count of sheets of window 1) > 0 then return true
			end try
			repeat with w in windows
				try
					if (name of w as text) contains "Gehe zum Ordner" then return true
					if (name of w as text) contains "Go to" then return true
				end try
			end repeat
		end tell
	end tell
	return false
end goToSheetOpen

on saveChangesButtonNames()
	set collected to ""
	tell application "System Events"
		if not (exists process appName) then return ""
		tell process appName
			repeat with i from 1 to (count of windows)
				try
					repeat with s in sheets of window i
						set sheetBlob to my safeAttr(s, "name") & " " & my safeValue(s)
						try
							repeat with k in (UI elements of s)
								set sheetBlob to sheetBlob & " " & my safeAttr(k, "name") & " " & my safeValue(k)
							end repeat
						end try
						if sheetBlob contains "Änderungen" or sheetBlob contains "behalten" or sheetBlob contains "sichern" then
							try
								repeat with b in (buttons of s)
									set collected to collected & (name of b as text) & ", "
								end repeat
							end try
						end if
					end repeat
				end try
			end repeat
		end tell
	end tell
	if collected is "" and controlExists("Löschen") then set collected to "Löschen, Abbrechen, Sichern"
	return collected
end saveChangesButtonNames

on dialogHasButton(wanted)
	return controlExists(wanted)
end dialogHasButton

on frontButtonNames()
	set collected to ""
	tell application "System Events"
		if not (exists process appName) then return "(FineReader not running)"
		tell process appName
			repeat with i from 1 to (count of windows)
				set collected to collected & my buttonNamesOf(window i, 6)
			end repeat
		end tell
	end tell
	if collected is "" then return "(none)"
	return collected
end frontButtonNames

on buttonNamesOf(el, depthLeft)
	if depthLeft ≤ 0 then return ""
	set collected to ""
	if {"AXButton", "AXCheckBox", "AXRadioButton", "AXPopUpButton"} contains safeAttr(el, "role") then
		set collected to collected & normalizeUIText(safeAttr(el, "name")) & ", "
	end if
	if {"AXScrollArea", "AXList", "AXOutline", "AXTable", "AXWebArea"} contains safeAttr(el, "role") then return collected
	repeat with k in childElements(el)
		set collected to collected & buttonNamesOf(contents of k, depthLeft - 1)
	end repeat
	return collected
end buttonNamesOf

on fileByteText(posixPath)
	try
		return do shell script "export LANG=en_US.UTF-8
p=" & quoted form of posixPath & "
if [ ! -e \"$p\" ]; then echo 0; exit 0; fi
if [ -d \"$p\" ]; then
  find \"$p\" -type f -exec stat -f%z {} + 2>/dev/null | awk '{s+=$1} END {print s+0}'
else
  stat -f%z \"$p\"
fi"
	on error
		return "0"
	end try
end fileByteText

on projectBytes(posixPath)
	set n to fileByteText(posixPath)
	if n is "" or n is "0" then return 0
	try
		return n as integer
	on error
		return 1
	end try
end projectBytes

on activateFineReader()
	tell application appName to activate
	delay 0.25
	tell application "System Events"
		if not (exists process appName) then error "FineReader is not running: " & appName
		tell process appName to set frontmost to true
	end tell
end activateFineReader

on clickMenuItemContaining(fragment)
	activateFineReader()
	tell application "System Events"
		tell process appName
			repeat with mbi in menu bar items of menu bar 1
				try
					repeat with mi in menu items of menu 1 of mbi
						try
							set itemName to name of mi as text
							if itemName contains fragment and enabled of mi then
								click mi
								return
							end if
						end try
					end repeat
				end try
			end repeat
		end tell
	end tell
	error "Menu item not found: " & fragment
end clickMenuItemContaining

on sendKeystroke(keyChar, modifiers)
	activateFineReader()
	tell application "System Events"
		if modifiers is {} then
			keystroke keyChar
		else
			keystroke keyChar using modifiers
		end if
	end tell
	delay 0.15
end sendKeystroke

on pasteText(textValue)
	try
		set previousClip to the clipboard as text
	on error
		set previousClip to ""
	end try
	set the clipboard to textValue
	delay 0.12
	tell application "System Events" to keystroke "v" using {command down}
	delay 0.12
	try
		set the clipboard to previousClip
	end try
end pasteText

on childElements(el)
	try
		with timeout of 8 seconds
			tell application "System Events" to return UI elements of el
		end timeout
	on error
		return {}
	end try
end childElements

on elementEnabled(el)
	tell application "System Events"
		try
			if enabled of el then return true
			return false
		end try
		try
			if (value of attribute "AXEnabled" of el) then return true
		end try
	end tell
	return false
end elementEnabled

on safeAttr(el, attrName)
	tell application "System Events"
		try
			if attrName is "role" then return role of el as text
			if attrName is "name" then
				if (name of el) is missing value then return ""
				return name of el as text
			end if
			if attrName is "description" then
				if (description of el) is missing value then return ""
				return description of el as text
			end if
		end try
	end tell
	return ""
end safeAttr

on safeValue(el)
	tell application "System Events"
		try
			set v to value of el
			if v is missing value then return ""
			if class of v is text or class of v is string then return v as text
			if class of v is integer or class of v is real then return v as text
		end try
	end tell
	return ""
end safeValue

on logLine(msg)
	set stamp to do shell script "date '+%Y-%m-%d %H:%M:%S'"
	set lineText to stamp & "  " & msg
	log lineText
	if logPath is not "" then
		try
			do shell script "printf '%s\\n' " & quoted form of lineText & " >> " & quoted form of logPath
		end try
	end if
end logLine
