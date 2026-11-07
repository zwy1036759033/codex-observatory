package agent_watcher

import (
	"bufio"
	"io"
	"os"
	"strings"
)

// Read only the visible preview instead of loading arbitrary-size project files.
func readCodePreview(path string, lines int) ([]string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	reader := bufio.NewReader(io.LimitReader(file, 128*1024))
	result := make([]string, 0, lines)
	for len(result) < lines {
		text, err := reader.ReadString('\n')
		if len(text) > 0 {
			text = strings.TrimRight(text, "\r\n")
			runes := []rune(text)
			if len(runes) > 2048 {
				text = string(runes[:2048]) + "…"
			}
			result = append(result, text)
		}
		if err != nil {
			if err != io.EOF {
				return result, err
			}
			break
		}
	}
	return result, nil
}
