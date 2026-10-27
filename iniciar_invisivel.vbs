Set WshShell = CreateObject("WScript.Shell")
' Executa o servidor Node.js em segundo plano (0 = Oculto)
WshShell.Run "node server.js", 0, False

' Aguarda 2 segundos para o servidor subir
WScript.Sleep 2000

' Abre o navegador web predefinido no sistema local
WshShell.Run "http://localhost:3000"
