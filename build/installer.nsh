!macro customInstall
  ; ========================================================================
  ; 1. РЕГИСТРАЦИЯ PROGID (ПРОТОКОЛЫ, HTML И PDF)
  ; ========================================================================

  ; ProgID для URL-ссылок (HTTP / HTTPS)
  WriteRegStr HKCU "Software\Classes\WebHubURL" "" "WebHub URL"
  WriteRegStr HKCU "Software\Classes\WebHubURL" "FriendlyTypeName" "WebHub URL"
  WriteRegStr HKCU "Software\Classes\WebHubURL\DefaultIcon" "" "$INSTDIR\WebHub_Desktop.exe,0"
  WriteRegStr HKCU "Software\Classes\WebHubURL\shell" "" "open"
  WriteRegStr HKCU "Software\Classes\WebHubURL\shell\open\command" "" '"$INSTDIR\WebHub_Desktop.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\WebHubURL\Application" "ApplicationName" "WebHub_Desktop"
  WriteRegStr HKCU "Software\Classes\WebHubURL\Application" "ApplicationIcon" "$INSTDIR\WebHub_Desktop.exe,0"
  WriteRegStr HKCU "Software\Classes\WebHubURL\Application" "ApplicationDescription" "WebHub Web Browser"

  ; ProgID для HTML-файлов (.html / .htm)
  WriteRegStr HKCU "Software\Classes\WebHubHTML" "" "WebHub HTML Document"
  WriteRegStr HKCU "Software\Classes\WebHubHTML" "FriendlyTypeName" "WebHub HTML Document"
  WriteRegStr HKCU "Software\Classes\WebHubHTML\DefaultIcon" "" "$INSTDIR\WebHub_Desktop.exe,0"
  WriteRegStr HKCU "Software\Classes\WebHubHTML\shell" "" "open"
  WriteRegStr HKCU "Software\Classes\WebHubHTML\shell\open\command" "" '"$INSTDIR\WebHub_Desktop.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\WebHubHTML\Application" "ApplicationName" "WebHub_Desktop"
  WriteRegStr HKCU "Software\Classes\WebHubHTML\Application" "ApplicationIcon" "$INSTDIR\WebHub_Desktop.exe,0"
  WriteRegStr HKCU "Software\Classes\WebHubHTML\Application" "ApplicationDescription" "WebHub Web Browser"

  ; НОВОЕ: ProgID для PDF-файлов (.pdf)
  WriteRegStr HKCU "Software\Classes\WebHubPDF" "" "WebHub PDF Document"
  WriteRegStr HKCU "Software\Classes\WebHubPDF" "FriendlyTypeName" "WebHub PDF Document"
  WriteRegStr HKCU "Software\Classes\WebHubPDF\DefaultIcon" "" "$INSTDIR\WebHub_Desktop.exe,0"
  WriteRegStr HKCU "Software\Classes\WebHubPDF\shell" "" "open"
  WriteRegStr HKCU "Software\Classes\WebHubPDF\shell\open\command" "" '"$INSTDIR\WebHub_Desktop.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\WebHubPDF\Application" "ApplicationName" "WebHub_Desktop"
  WriteRegStr HKCU "Software\Classes\WebHubPDF\Application" "ApplicationIcon" "$INSTDIR\WebHub_Desktop.exe,0"
  WriteRegStr HKCU "Software\Classes\WebHubPDF\Application" "ApplicationDescription" "WebHub Web Browser"

  ; ========================================================================
  ; 2. РЕГИСТРАЦИЯ СТАНДАРТНЫХ CAPABILITIES В КОРНЕ SOFTWARE
  ; ========================================================================
  WriteRegStr HKCU "Software\WebHub_Desktop\Capabilities" "ApplicationName" "WebHub_Desktop"
  WriteRegStr HKCU "Software\WebHub_Desktop\Capabilities" "ApplicationDescription" "WebHub Web Browser"
  WriteRegStr HKCU "Software\WebHub_Desktop\Capabilities" "ApplicationIcon" "$INSTDIR\WebHub_Desktop.exe,0"
  
  ; Ассоциации URL
  WriteRegStr HKCU "Software\WebHub_Desktop\Capabilities\URLAssociations" "http" "WebHubURL"
  WriteRegStr HKCU "Software\WebHub_Desktop\Capabilities\URLAssociations" "https" "WebHubURL"
  
  ; Ассоциации файлов для корня (Добавлен .pdf)
  WriteRegStr HKCU "Software\WebHub_Desktop\Capabilities\FileAssociations" ".html" "WebHubHTML"
  WriteRegStr HKCU "Software\WebHub_Desktop\Capabilities\FileAssociations" ".htm" "WebHubHTML"
  WriteRegStr HKCU "Software\WebHub_Desktop\Capabilities\FileAssociations" ".pdf" "WebHubPDF"

  ; ========================================================================
  ; 3. РЕГИСТРАЦИЯ В STARTMENUINTERNET
  ; ========================================================================
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WebHub_Desktop" "" "WebHub_Desktop"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WebHub_Desktop\DefaultIcon" "" "$INSTDIR\WebHub_Desktop.exe,0"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WebHub_Desktop\shell\open\command" "" '"$INSTDIR\WebHub_Desktop.exe"'
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WebHub_Desktop\Capabilities" "ApplicationName" "WebHub_Desktop"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WebHub_Desktop\Capabilities" "ApplicationDescription" "WebHub Web Browser"
  
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WebHub_Desktop\Capabilities\URLAssociations" "http" "WebHubURL"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WebHub_Desktop\Capabilities\URLAssociations" "https" "WebHubURL"
  
  ; Ассоциации файлов в StartMenuInternet (Добавлен .pdf)
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WebHub_Desktop\Capabilities\FileAssociations" ".html" "WebHubHTML"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WebHub_Desktop\Capabilities\FileAssociations" ".htm" "WebHubHTML"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WebHub_Desktop\Capabilities\FileAssociations" ".pdf" "WebHubPDF"
  
  ; ========================================================================
  ; 4. ДОПОЛНИТЕЛЬНАЯ ИНТЕГРАЦИЯ И ОБНОВЛЕНИЕ КЭША
  ; ========================================================================
  WriteRegStr HKCU "Software\RegisteredApplications" "WebHub_Desktop" "Software\WebHub_Desktop\Capabilities"

  WriteRegStr HKCU "Software\Classes\Applications\WebHub_Desktop.exe" "FriendlyAppName" "WebHub_Desktop"
  WriteRegStr HKCU "Software\Classes\Applications\WebHub_Desktop.exe\shell\open\command" "" '"$INSTDIR\WebHub_Desktop.exe" "%1"'

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)' ; SHCNE_ASSOCCHANGED
!macroend

!macro customUnInstall
  ; Полная очистка при удалении
  DeleteRegKey HKCU "Software\Classes\WebHubURL"
  DeleteRegKey HKCU "Software\Classes\WebHubHTML"
  DeleteRegKey HKCU "Software\Classes\WebHubPDF" ; Удаляем ProgID для PDF
  DeleteRegKey HKCU "Software\WebHub_Desktop"
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\WebHub_Desktop"
  DeleteRegValue HKCU "Software\RegisteredApplications" "WebHub_Desktop"
  DeleteRegKey HKCU "Software\Classes\Applications\WebHub_Desktop.exe"
  
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend