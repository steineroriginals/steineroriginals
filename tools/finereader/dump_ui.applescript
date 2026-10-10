-- Dump the German FineReader UI at six observed states.
--
-- Usage:
--   osascript dump_ui.applescript              # pause for each of the six states
--   osascript dump_ui.applescript steps
--   osascript dump_ui.applescript watch        # auto-capture while you do one file by hand
--   osascript dump_ui.applescript once         # dump whatever is on screen now
--   osascript dump_ui.applescript <mode> <output-dir>
--
-- Each dump contains the menu bar (with enabled), every window (title, role, subrole),
-- and the front window hierarchy (groups, buttons, text fields, static texts,
-- progress indicators, sheets). The header repeats the status-field text and
-- whether "Exportieren" is enabled.
--
-- Page lists are capped so the dump stays about the chrome, not every OCR glyph.
-- The phase-2 warning triangle is part of the hierarchy and is not an error.

property appName : "ABBYY FineReader PDF"
property outputDir : "/Users/michael/Reniets/Ai/steineroriginals/tools/finereader/ui-dumps"
property exportButtonName : "Exportieren"
property importButtonName : "Bilder in neues OCR-Projekt importieren"
property openButtonName : "Öffnen"
property saveButtonName : "Sichern"
property untitledMarker : "Ohne Titel"
property phaseAdd : "Seiten hinzufügen"
property phaseRecognize : "Seiten werden erkannt"

property chunkList : {}
property lineCount : 0
property truncated : false
property exportSummary : "Exportieren: not found"
property statusSummary : ""

on run argv
	set mode to "steps"
	if (count of argv) ≥ 1 then set mode to item 1 of argv
	if (count of argv) ≥ 2 then set outputDir to item 2 of argv
	do shell script "mkdir -p " & quoted form of outputDir
	if mode is "once" then
		set outPath to writeDump("00-jetzt", "Current front window")
		return outPath
	else if mode is "watch" then
		return watchStates()
	else if mode is "steps" then
		return stepStates()
	else
		error "Usage: osascript dump_ui.applescript [steps|watch|once] [output-dir]"
	end if
end run

on stepStates()
	set states to {¬
		{"01-startfenster", "Startfenster nach Cmd+N", "Cmd+N ist gedrückt. Sichtbar ist der Button: Bilder in neues OCR-Projekt importieren."}, ¬
		{"02-oeffnen-dialog", "Öffnen-Dialog", "Der macOS-Öffnen-Dialog ist vorn, mit dem Button Öffnen."}, ¬
		{"03-phase-hinzufuegen", "Dokumentfenster Phase 1", "Fenster Ohne Titel. Das Statusfeld zeigt: Seiten hinzufügen."}, ¬
		{"04-phase-erkennen", "Dokumentfenster Phase 2", "Das Statusfeld zeigt: Seiten werden erkannt. Das Warndreieck mit der Zahl ist normal."}, ¬
		{"05-fertig", "Dokumentfenster fertig erkannt", "Weder Seiten hinzufügen noch Seiten werden erkannt. Exportieren ist aktiv."}, ¬
		{"06-speichern-dialog", "Speichern-Dialog", "Cmd+S. Der Sichern-Dialog ist offen, noch nicht bestätigt."}}
	set written to ""
	set n to 0
	repeat with stateRow in states
		set n to n + 1
		set stateId to item 1 of stateRow
		set stateTitle to item 2 of stateRow
		set stateHint to item 3 of stateRow
		set choice to display dialog (n as text) & "/6  " & stateTitle & return & return & stateHint buttons {"Stop", "Dump"} default button "Dump" with title "FineReader UI dump"
		if button returned of choice is "Stop" then exit repeat
		set outPath to writeDump(stateId, stateTitle)
		set written to written & outPath & linefeed
	end repeat
	return written
end stepStates

on watchStates()
	display dialog "FineReader einmal von Hand durchklicken: Cmd+N, Import, Öffnen, warten bis die Erkennung fertig ist, dann Cmd+S und den Sichern-Dialog offen lassen. Dieses Skript schreibt jeden Zustand, sobald er sichtbar ist." buttons {"Start"} default button "Start" with title "FineReader UI dump"
	set seen to {false, false, false, false, false, false}
	set phase2Seen to false
	set doneStable to missing value
	set deadline to (current date) + (60 * 60)
	repeat
		if (current date) ≥ deadline then exit repeat
		set flags to scanFlags()
		if item 4 of flags then set phase2Seen to true
		set stateNum to 0
		if item 6 of flags then
			set stateNum to 6
		else if item 4 of flags then
			set stateNum to 4
		else if item 3 of flags then
			set stateNum to 3
		else if item 2 of flags and not (item 5 of flags) then
			set stateNum to 2
		else if item 1 of flags and not (item 5 of flags) then
			set stateNum to 1
		else if phase2Seen and (item 5 of flags) and (item 7 of flags) and not (item 3 of flags) and not (item 4 of flags) then
			if doneStable is missing value then set doneStable to current date
			if ((current date) - doneStable) ≥ 5 then set stateNum to 5
		else
			set doneStable to missing value
		end if
		if stateNum is not 0 and not (item stateNum of seen) then
			set meta to stateMeta(stateNum)
			set outPath to writeDump(item 1 of meta, item 2 of meta)
			set item stateNum of seen to true
			log "captured " & outPath
		end if
		if (item 1 of seen) and (item 2 of seen) and (item 3 of seen) and (item 4 of seen) and (item 5 of seen) and (item 6 of seen) then exit repeat
		delay 1
	end repeat
	set missingStates to ""
	repeat with i from 1 to 6
		if not (item i of seen) then
			set meta to stateMeta(i)
			set missingStates to missingStates & (item 1 of meta) & " "
		end if
	end repeat
	if missingStates is "" then return "captured all six states in " & outputDir
	return "missing: " & missingStates
end watchStates

on stateMeta(stateNum)
	if stateNum is 1 then return {"01-startfenster", "Startfenster nach Cmd+N"}
	if stateNum is 2 then return {"02-oeffnen-dialog", "Öffnen-Dialog"}
	if stateNum is 3 then return {"03-phase-hinzufuegen", "Dokumentfenster Phase 1"}
	if stateNum is 4 then return {"04-phase-erkennen", "Dokumentfenster Phase 2"}
	if stateNum is 5 then return {"05-fertig", "Dokumentfenster fertig erkannt"}
	return {"06-speichern-dialog", "Speichern-Dialog"}
end stateMeta

-- {import button, open button, phase add, phase recognize, untitled window, save button, export enabled}
on scanFlags()
	set hasImport to false
	set hasOpen to false
	set hasAdd to false
	set hasRec to false
	set hasUntitled to false
	set hasSave to false
	set exportOn to false
	tell application "System Events"
		if not (exists process appName) then return {false, false, false, false, false, false, false}
		tell process appName
			repeat with w in windows
				try
					if (name of w as text) contains untitledMarker then set hasUntitled to true
				end try
			end repeat
			if (count of windows) ≥ 1 then
				set frontBits to my inspectTree(window 1, 8)
				set hasImport to item 1 of frontBits
				set hasOpen to item 2 of frontBits
				set hasAdd to item 3 of frontBits
				set hasRec to item 4 of frontBits
				set hasSave to item 5 of frontBits
				set exportOn to item 6 of frontBits
				try
					repeat with s in sheets of window 1
						set sheetBits to my inspectTree(s, 6)
						if item 2 of sheetBits then set hasOpen to true
						if item 5 of sheetBits then set hasSave to true
					end repeat
				end try
			end if
		end tell
	end tell
	return {hasImport, hasOpen, hasAdd, hasRec, hasUntitled, hasSave, exportOn}
end scanFlags

on inspectTree(el, depthLeft)
	set hasImport to false
	set hasOpen to false
	set hasAdd to false
	set hasRec to false
	set hasSave to false
	set exportOn to false
	set blob to safeAttr(el, "name") & " " & safeValue(el) & " " & safeAttr(el, "description")
	if blob contains importButtonName then set hasImport to true
	if safeAttr(el, "role") is "AXButton" and safeAttr(el, "name") is openButtonName then set hasOpen to true
	if safeAttr(el, "role") is "AXButton" and safeAttr(el, "name") is saveButtonName then set hasSave to true
	if blob contains phaseAdd then set hasAdd to true
	if blob contains phaseRecognize then set hasRec to true
	if safeAttr(el, "name") is exportButtonName or safeAttr(el, "name") starts with exportButtonName then
		if elementEnabled(el) then set exportOn to true
	end if
	set elRole to safeAttr(el, "role")
	if depthLeft ≤ 0 or {"AXScrollArea", "AXList", "AXOutline", "AXTable", "AXWebArea", "AXImage"} contains elRole then
		return {hasImport, hasOpen, hasAdd, hasRec, hasSave, exportOn}
	end if
	try
		set kids to {}
		tell application "System Events" to set kids to UI elements of el
		repeat with k in kids
			set childBits to inspectTree(contents of k, depthLeft - 1)
			if item 1 of childBits then set hasImport to true
			if item 2 of childBits then set hasOpen to true
			if item 3 of childBits then set hasAdd to true
			if item 4 of childBits then set hasRec to true
			if item 5 of childBits then set hasSave to true
			if item 6 of childBits then set exportOn to true
		end repeat
	end try
	return {hasImport, hasOpen, hasAdd, hasRec, hasSave, exportOn}
end inspectTree

on writeDump(stateId, stateTitle)
	resetBuffer()
	dumpMenus()
	addLine("")
	dumpWindows()
	addLine("")
	addLine("--- FRONT WINDOW ---")
	dumpFront()
	set AppleScript's text item delimiters to linefeed
	set body to chunkList as text
	set AppleScript's text item delimiters to ""
	set header to "=== " & stateId & "  " & stateTitle & " ===" & linefeed
	set header to header & "time: " & ((current date) as text) & linefeed & linefeed
	set header to header & "--- EXPORTIEREN ---" & linefeed & exportSummary & linefeed & linefeed
	set header to header & "--- STATUS ---" & linefeed
	if statusSummary is "" then
		set header to header & "(no status text found)" & linefeed
	else
		set header to header & statusSummary
	end if
	if truncated then set header to header & linefeed & "(hierarchy truncated)" & linefeed
	set header to header & linefeed
	set outPath to outputDir & "/" & stateId & ".txt"
	writeUtf8(outPath, header & body)
	return outPath
end writeDump

on dumpMenus()
	addLine("--- MENU BAR ---")
	try
		with timeout of 20 seconds
			tell application "System Events"
				if not (exists process appName) then
					my addLine("(FineReader not running)")
					return
				end if
				tell process appName
					set mbiList to menu bar items of menu bar 1
					repeat with mbi in mbiList
						my addLine("MENU " & my safeName(mbi) & " " & my enabledWord(mbi))
						try
							set itemList to menu items of menu 1 of mbi
							repeat with mi in itemList
								my addLine("  " & my enabledWord(mi) & "  " & my safeName(mi))
							end repeat
						on error errMsg
							my addLine("  (items unavailable: " & errMsg & ")")
						end try
					end repeat
				end tell
			end tell
		end timeout
	on error errMsg
		addLine("menu bar error: " & errMsg)
	end try
end dumpMenus

on dumpWindows()
	addLine("--- WINDOWS ---")
	tell application "System Events"
		if not (exists process appName) then
			my addLine("(FineReader not running)")
			return
		end if
		tell process appName
			if (count of windows) is 0 then
				my addLine("(no windows)")
				return
			end if
			set i to 0
			repeat with w in windows
				set i to i + 1
				my addLine("WINDOW " & i & " title=" & my q(my safeName(w)) & " role=" & my safeRole(w) & " subrole=" & my safeSubrole(w))
			end repeat
		end tell
	end tell
end dumpWindows

on dumpFront()
	tell application "System Events"
		if not (exists process appName) then
			my addLine("(FineReader not running)")
			return
		end if
		tell process appName
			if (count of windows) is 0 then
				my addLine("(no front window)")
				return
			end if
			my dumpElement(window 1, 0)
			try
				set sheetList to sheets of window 1
				if (count of sheetList) > 0 then
					my addLine("SHEETS " & (count of sheetList))
					repeat with s in sheetList
						my dumpElement(s, 1)
					end repeat
				end if
			end try
		end tell
	end tell
end dumpFront

on dumpElement(el, depthLeft)
	if truncated then return
	if depthLeft > 14 then
		addLine(indentFor(depthLeft) & "... depth limit")
		return
	end if
	set elRole to safeRole(el)
	set elSub to safeSubrole(el)
	set elName to safeName(el)
	set elValue to safeValue(el)
	set elDesc to safeDesc(el)
	set elOn to enabledWord(el)
	noteInteresting(elRole, elName, elValue, elDesc, elOn)
	set lineText to indentFor(depthLeft) & elRole
	if elSub is not "" and elSub is not "missing value" then set lineText to lineText & " subrole=" & elSub
	if elName is not "" then set lineText to lineText & " name=" & q(elName)
	if elValue is not "" then set lineText to lineText & " value=" & q(elValue)
	if elDesc is not "" and elDesc is not elName then set lineText to lineText & " desc=" & q(elDesc)
	set lineText to lineText & " " & elOn
	addLine(lineText)
	set skipKids to ({"AXScrollArea", "AXList", "AXOutline", "AXTable", "AXWebArea", "AXImage"} contains elRole)
	if skipKids then
		addLine(indentFor(depthLeft + 1) & "(children of " & elRole & " omitted)")
		return
	end if
	set kids to {}
	try
		tell application "System Events" to set kids to UI elements of el
	end try
	set kidCount to count of kids
	set cap to 80
	if {"AXWindow", "AXSheet", "AXToolbar", "AXGroup"} contains elRole then set cap to 200
	set shown to 0
	repeat with k in kids
		if truncated then return
		set shown to shown + 1
		if shown > cap then
			addLine(indentFor(depthLeft + 1) & "... " & (kidCount - cap) & " further children omitted")
			return
		end if
		dumpElement(contents of k, depthLeft + 1)
	end repeat
end dumpElement

on noteInteresting(elRole, elName, elValue, elDesc, elOn)
	set blob to elName & " " & elValue & " " & elDesc
	if elName is exportButtonName or elName starts with exportButtonName then
		set exportSummary to "Exportieren: found role=" & elRole & " " & elOn & " value=" & q(elValue)
	end if
	if blob contains phaseAdd or blob contains phaseRecognize or elName is "Status" or elValue is "Status" or elDesc is "Status" then
		set statusSummary to statusSummary & elRole & " " & elOn & " name=" & q(elName) & " value=" & q(elValue) & " desc=" & q(elDesc) & linefeed
	end if
end noteInteresting

on resetBuffer()
	set chunkList to {}
	set lineCount to 0
	set truncated to false
	set exportSummary to "Exportieren: not found"
	set statusSummary to ""
end resetBuffer

on addLine(s)
	if truncated then return
	set end of chunkList to s
	set lineCount to lineCount + 1
	if lineCount ≥ 4000 then
		set end of chunkList to "... truncated at 4000 lines"
		set truncated to true
	end if
end addLine

on indentFor(depthLeft)
	set pad to ""
	repeat depthLeft times
		set pad to pad & "  "
	end repeat
	return pad
end indentFor

on enabledWord(el)
	tell application "System Events"
		try
			if enabled of el then return "enabled"
			return "disabled"
		end try
	end tell
	return "enabled?"
end enabledWord

on safeName(el)
	tell application "System Events"
		try
			if (name of el) is missing value then return ""
			return name of el as text
		end try
	end tell
	return ""
end safeName

on safeRole(el)
	tell application "System Events"
		try
			return role of el as text
		end try
	end tell
	return ""
end safeRole

on safeSubrole(el)
	tell application "System Events"
		try
			if (subrole of el) is missing value then return ""
			return subrole of el as text
		end try
	end tell
	return ""
end safeSubrole

on safeDesc(el)
	tell application "System Events"
		try
			if (description of el) is missing value then return ""
			return description of el as text
		end try
	end tell
	return ""
end safeDesc

on safeValue(el)
	tell application "System Events"
		try
			set v to value of el
			if v is missing value then return ""
			if class of v is text or class of v is string then return v as text
			if class of v is integer or class of v is real or class of v is boolean then return v as text
		end try
	end tell
	return ""
end safeValue

on safeAttr(el, attrName)
	if attrName is "name" then return safeName(el)
	if attrName is "description" then return safeDesc(el)
	if attrName is "role" then return safeRole(el)
	return ""
end safeAttr

on elementEnabled(el)
	tell application "System Events"
		try
			return enabled of el
		end try
	end tell
	return false
end elementEnabled

on q(s)
	return "\"" & s & "\""
end q

on writeUtf8(posixPath, content)
	set fh to missing value
	try
		set fh to open for access (POSIX file posixPath) with write permission
		set eof of fh to 0
		write content to fh as «class utf8»
		close access fh
	on error errMsg
		try
			if fh is not missing value then close access fh
		end try
		error "Could not write " & posixPath & ": " & errMsg
	end try
end writeUtf8
