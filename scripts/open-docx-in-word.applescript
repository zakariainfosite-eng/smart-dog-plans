#!/usr/bin/env osascript
-- Open generated DOCX in Microsoft Word and verify it loads without repair.

on run argv
  if (count of argv) is 0 then
    error "Usage: open-docx-in-word.applescript /absolute/path/to/file.docx"
  end if
  set docxPath to item 1 of argv

  tell application "Microsoft Word"
    activate
    try
      close every document saving no
    end try
    try
      open POSIX file docxPath
      delay 5
      set docCount to count of documents
      if docCount is 0 then
        return "ERROR:0:Word opened but document count is 0 (possible repair dialog)"
      end if
      set d to document 1
      set docName to name of d
      set fullName to full name of d
      close d saving no
      return "OK:docCount=" & docCount & ":name=" & docName & ":path=" & fullName
    on error errMsg number errNum
      try
        close every document saving no
      end try
      return "ERROR:" & errNum & ":" & errMsg
    end try
  end tell
end run
