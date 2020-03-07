import { inlineGrammar, lineGrammar, punctuationLeading, punctuationTrailing, htmlescape } from "./grammar";

function stringifyObject(event) {
  let keys = [];
  let obj = event;

  do {
    Object.getOwnPropertyNames(obj).forEach(function(prop) {
      if (keys.indexOf(prop) === -1) {
        keys.push(prop);
      }
    });
  } while (obj = Object.getPrototypeOf(obj));

  return '{\n' + keys.reduce(function (str, key) {
    switch (typeof event[key]) {
      case 'number':
      case 'boolean':
      case 'bigint':
        str = `${str}  ${key}: ${event[key]},\n`
        break;
      case 'string':
        str = `${str}  ${key}: '${event[key]}',\n`
        break;
      case 'object':
        str = `${str}  ${key}: {...},\n`
        break;
      case 'function':
        str = `${str}  ${key}: () => {...},\n`
        break;
      case 'undefined':
        str = `${str}  ${key}: undefined,\n`
        break;
      default:
        str = `${str}  ${key}: ?,\n`
    }
    return str;
  }, '') + '}';
}

class TinyMDE {

  constructor(props = {}) {    
    this.e = null;
    this.lines = [];
    this.lineElements = [];
    this.lineTypes = [];
    this.lineCaptures = [];
    this.lineReplacements = [];
    this.linkLabels = [];

    if (props.element && !props.element.tagName) {
      props.element = document.getElementById(props.element);
    }
    if (!props.element) {
      props.element = document.createElement('div');
      document.getElementsByTagName('body')[0].appendChild(props.element);
    }
    this.createEditorElement(props.element);
    this.setContent(props.content || '# Hello TinyMDE!\nEdit **here**');
  }

  createEditorElement(element) {
    this.e = document.createElement('div');
    this.e.className = 'TinyMDE';
    this.e.contentEditable = true;
    // The following is important for formatting purposes, but also since otherwise the browser replaces subsequent spaces with  &nbsp; &nbsp;
    // That breaks a lot of stuff, so we do this here and not in CSS—therefore, you don't have to remember to but this in the CSS file
    this.e.style.whiteSpace = 'pre-wrap'; 
    element.appendChild(this.e);
    this.e.addEventListener("input", (e) => this.handleInputEvent(e));
    // this.e.addEventListener("keydown", (e) => this.handleKeydownEvent(e));
    document.addEventListener("selectionchange", (e) => this.handleSelectionChangeEvent(e));
    this.e.addEventListener("paste", (e) => this.handlePaste(e));
  }

  setContent(content) {
    // Delete any existing content
    for (let e of this.lineElements) {
      e.parentElement.removeChild(e);
    }
    this.lineElements = [];

    this.lines = content.split(/(?:\r\n|\r|\n)/);
    for (let lineNum = 0; lineNum < this.lines.length; lineNum++) {
      let le = document.createElement('div');
      // le.className = 'TMPara';
      // this.lineTypes.push(le.className);
      this.e.appendChild(le);
      this.lineElements.push(le);
      // this.updateInlineStyles(lineNum);
      // let te = document.createTextNode(l); // TODO inline parsing
      // le.appendChild(te);

    }
    this.lineTypes = new Array(this.lines.length);
    this.updateFormatting();
  }

  updateFormatting() {
    this.updateLineTypes();

    this.updateLinkLabels();

    for (let l = 0; l < this.lines.length; l++) {
      this.applyLineType(l, this.lineTypes[l], this.lineReplacements[l], this.lineCaptures[l]);    
    }
  }

  updateLinkLabels() {
    this.linkLabels = [];
    for (let l = 0; l < this.lines.length; l++) {
      if (this.lineTypes[l] == 'TMLinkReferenceDefinition') {
        this.linkLabels.push(this.lineCaptures[l][lineGrammar.TMLinkReferenceDefinition.labelPlaceholder]);
      }
    }
    this.log(`Link labels`, stringifyObject(this.linkLabels));
  }

  replace(replacement, capture) {
    return replacement
      .replace(/\$\$([0-9])/g, (str, p1) => this.processInlineStyles(capture[p1])) 
      .replace(/\$([0-9])/g, (str, p1) => htmlescape(capture[p1]));
  }

  applyLineType(lineNum, lineType, lineReplacement, lineCapture) {
    this.lineTypes[lineNum] = lineType;
    this.lineElements[lineNum].className = lineType;
    this.lineElements[lineNum].innerHTML = this.replace(lineReplacement, lineCapture);
  }

  updateLineTypes() {
    for (let lineNum = 0; lineNum < this.lines.length; lineNum++) {
      let lineType = 'TMPara';
      let lineCapture = [this.lines[lineNum]];
      let lineReplacement = '$$0'; // Default replacement for paragraph: Inline format the entire line

      // Check ongoing code blocks
      if (lineNum > 0 && (this.lineTypes[lineNum - 1] == 'TMCodeFenceBacktickOpen' || this.lineTypes[lineNum - 1] == 'TMFencedCodeBacktick')) {
        // We're in a backtick-fenced code block, check if the current line closes it
        let capture = lineGrammar.TMCodeFenceBacktickOpen.regexp.exec(this.lines[lineNum]);
        if (capture) {
          lineType = 'TMCodeFenceBacktickClose';
          lineReplacement = lineGrammar.TMCodeFenceBacktickOpen.replacement;
          lineCapture = capture;
        } else {
          lineType = 'TMFencedCodeBacktick';
          lineReplacement = '$0';
          lineCapture = [this.lines[lineNum]];
        } 
      }
      if (lineNum > 0 && (this.lineTypes[lineNum - 1] == 'TMCodeFenceTildeOpen' || this.lineTypes[lineNum - 1] == 'TMFencedCodeTilde')) {
        // We're in a tilde-fenced code block
        let capture = lineGrammar.TMCodeFenceTildeOpen.regexp.exec(this.lines[lineNum]);
        if (capture)  {
          lineType = 'TMCodeFenceTildeClose';
          lineReplacement = lineGrammar.TMCodeFenceTildeOpen.replacement;
          lineCapture = capture;
        }
        else {
          lineType = 'TMFencedCodeTilde';
          lineReplacement = '$0';
          lineCapture = [this.lines[lineNum]];
        } 
      }

      // Check all regexps if we haven't applied one of the code block types
      if (lineType == 'TMPara') {
        for (let type of Object.keys(lineGrammar)) {
          let capture = lineGrammar[type].regexp.exec(this.lines[lineNum]);
          if (capture) {
            lineType = type;
            lineReplacement = lineGrammar[type].replacement;
            lineCapture = capture;
            break;
          }
        }
      }

      // Setext H2 markers that can also be interpreted as an empty list item should be regarded as such (as per CommonMark spec)
      if (lineType == 'TMSetextH2Marker') {
        let capture = lineGrammar.TMUL.regexp.exec(this.lines[lineNum]);
        if (capture) {
          lineType = 'TMUL';
          lineReplacement = lineGrammar.TMUL.replacement;
          lineCapture = capture;
        }      
      }

      // Setext headings are only valid if preceded by a paragraph (and if so, they change the type of the previous paragraph)
      if (lineType == 'TMSetextH1Marker' || lineType == 'TMSetextH2Marker') {
        if (lineNum == 0 || this.lineTypes[lineNum - 1] != 'TMPara') {
          // Setext marker is invalid. However, a H2 marker might still be a valid HR, so let's check that
          let capture = lineGrammar.TMHR.regexp.exec(this.lines[lineNum]);
          if (capture) {
            // Valid HR
            lineType = 'TMHR';
            lineCapture = capture;
            lineReplacement = lineGrammar.TMHR.replacement;
          } else {
            // Not valid HR, format as TMPara
            lineType = 'TMPara';
            lineCapture = [this.lines[lineNum]];
            lineReplacement = '$$0';
          }
        } else {
          // Valid setext marker. Change types of preceding para lines
          let headingLine = lineNum - 1;
          do {
            this.lineTypes[headingLine] = (lineType == 'TMSetextH1Marker' ? 'TMSetextH1' : 'TMSetextH2');
            this.lineReplacements[headingLine] = '$$0';
            this.lineCaptures[headingLine] = [this.lines[headingLine]];

            headingLine--;
          } while(headingLine > 0 && this.lineTypes[headingLine] == 'TMPara'); 
        }
      }
      // Lastly, save the line style to be applied later
      this.lineTypes[lineNum] = lineType;
      this.lineReplacements[lineNum] = lineReplacement;
      this.lineCaptures[lineNum] = lineCapture;
    }
  }

  updateLineContentsAndFormatting() {
    if (this.updateLineContents()) {
      this.updateFormatting();
    }
  }

  parseLinkOrImage(originalString, isImage) {
    // Skip the opening bracket
    let textOffset = isImage ? 2 : 1;
    let opener = originalString.substr(0, textOffset);
    let type = isImage ? 'TMImage' : 'TMLink';
    let currentOffset = textOffset;
    
    let bracketLevel = 1;
    let linkText = false;
  
  
    textOuter: while (currentOffset < originalString.length && !linkText) {
      let string = originalString.substr(currentOffset);
  
      // Process any escapes and code blocks at current position, they bind more strongly than links
      // TODO: Autolinks, HTML tags also bind more strongly
      for (let rule of ['escape', 'code']) {
        let cap = inlineGrammar[rule].regexp.exec(string);
        if (cap) {
          currentOffset += cap[0].length;
          continue textOuter; 
        }
      }
  
      // Check for image. It's okay for an image to be included in a link or image
      if (string.match(inlineGrammar.imageOpen.regexp)) {
        // Opening image. It's okay if this is a matching pair of brackets
        bracketLevel++;
        currentOffset += 2;
        continue textOuter;
      }
  
      if (string.match(inlineGrammar.linkOpen.regexp)) {
        // Opening bracket. Two things to do:
        // 1) it's okay if this part of a pair of brackets.
        // 2) If we are currently trying to parse a link, this nested bracket musn't start a valid link (no nested links allowed)
        bracketLevel++;
        // if (bracketLevel >= 2) return false; // Nested unescaped brackets, this doesn't qualify as a link / image
        if (!isImage) {
          if (this.parseLinkOrImage(string, false)) {
            // Valid link inside this possible link, which makes this link invalid (inner links beat outer ones)
            return false;
          }
        }
        currentOffset += 1;
        continue textOuter;
      }
  
      if (string.match(/^\]/)) {
        bracketLevel--;
        if (bracketLevel == 0) {
          // Found matching bracket and haven't found anything disqualifying this as link / image.
          linkText = originalString.substr(textOffset, currentOffset - textOffset);
          currentOffset++;
          continue textOuter;
        }
      }
  
      // Nothing matches, proceed to next char
      currentOffset++;
    }
  
    // Did we find a link text (i.e., find a matching closing bracket?)
    if (!linkText) return false; // Nope
  
    // So far, so good. We've got a valid link text. Let's see what type of link this is
  
    // TODO parse inline link here
  
    // if (originalString.substr(currentOffset).match(/^\(/)) {
    //   // Potential inline link / image
    //   let parenthesisOffset = currentOffset + 1;
    //   let parenthesisLevel = 0;
  
  
    // } else {
      // Ref link / image
      return {
        replacement : `<span class="TMMark TMMark_${type}">${opener}</span><span class="${type}">${this.processInlineStyles(linkText)}</span><span class="TMMark TMMark_${type}">]</span>`,
        charCount :  currentOffset
      }
    // }
  
  }
  
  processInlineStyles(originalString) {
    let processed = '';
    let stack = []; // Stack is an array of objects of the format: {delimiter, delimString, count, output}
    let offset = 0;
    let string = originalString;
  
  
    outer: while (string) {
      // Process simple rules (non-delimiter)
      for (let rule of ['escape', 'code']) {
        let cap = inlineGrammar[rule].regexp.exec(string);
        if (cap) {
          string = string.substr(cap[0].length);
          offset += cap[0].length;
          processed += inlineGrammar[rule].replacement
            // .replace(/\$\$([1-9])/g, (str, p1) => processInlineStyles(cap[p1])) // todo recursive calling
            .replace(/\$([1-9])/g, (str, p1) => htmlescape(cap[p1]));
          continue outer; 
        }
      }
  
      // Check for links / images
      let potentialLink = string.match(inlineGrammar.linkOpen.regexp);
      let potentialImage = string.match(inlineGrammar.imageOpen.regexp);
      if (potentialImage || potentialLink) {
        let result = this.parseLinkOrImage(string, potentialImage);
        if (result) {
          processed = `${processed}${result.replacement}`;
          string = string.substr(result.charCount);
          offset += result.charCount;
          continue outer;
        }
      }
      
      // Check for em / strong delimiters
      let cap = /(^\*+)|(^_+)/.exec(string);
      if (cap) {
        let delimCount = cap[0].length;
        const delimString = cap[0];
        const currentDelimiter = cap[0][0]; // This should be * or _
  
        string = string.substr(cap[0].length);
      
        // We have a delimiter run. Let's check if it can open or close an emphasis.
        
        const preceding = (offset > 0) ? originalString.substr(0, offset) : ' '; // beginning and end of line count as whitespace
        const following = (offset + cap[0].length < originalString.length) ? string : ' ';
  
        const punctuationFollows = following.match(punctuationLeading);
        const punctuationPrecedes = preceding.match(punctuationTrailing);
        const whitespaceFollows = following.match(/^\s/);
        const whitespacePrecedes = preceding.match(/\s$/);
  
        // These are the rules for right-flanking and left-flanking delimiter runs as per CommonMark spec
        let canOpen = !whitespaceFollows && (!punctuationFollows || !!whitespacePrecedes || !!punctuationPrecedes);
        let canClose = !whitespacePrecedes && (!punctuationPrecedes || !!whitespaceFollows || !!punctuationFollows);
  
        // Underscores have more detailed rules than just being part of left- or right-flanking run:
        if (currentDelimiter == '_' && canOpen && canClose) {
          canOpen = punctuationPrecedes;
          canClose = punctuationFollows;
        }
  
        // If the delimiter can close, check the stack if there's something it can close
        if (canClose) {
          let stackPointer = stack.length - 1;
          // See if we can find a matching opening delimiter, move down through the stack
          while (delimCount && stackPointer >= 0) {
            if (stack[stackPointer].delimiter == currentDelimiter) {
              // We found a matching delimiter, let's construct the formatted string
  
              // Firstly, if we skipped any stack levels, pop them immediately (non-matching delimiters)
              while (stackPointer < stack.length - 1) {
                const entry = stack.pop();
                processed = `${entry.output}${entry.delimString.substr(0, entry.count)}${processed}`;
              }
  
              // Then, format the string
              if (delimCount >= 2 && stack[stackPointer].count >= 2) {
                // Strong
                processed = `<span class="TMMark">${currentDelimiter}${currentDelimiter}</span><strong>${processed}</strong><span class="TMMark">${currentDelimiter}${currentDelimiter}</span>`;
                delimCount -= 2;
                stack[stackPointer].count -= 2;
              } else {
                // Em
                processed = `<span class="TMMark">${currentDelimiter}</span><em>${processed}</em><span class="TMMark">${currentDelimiter}</span>`;
                delimCount -= 1;
                stack[stackPointer].count -= 1;
              }
  
              // If that stack level is empty now, pop it
              if (stack[stackPointer].count == 0) {
                let entry = stack.pop();
                processed = `${entry.output}${processed}`
                stackPointer--;
              }
  
            } else {
              // This stack level's delimiter type doesn't match the current delimiter type
              // Go down one level in the stack
              stackPointer--;
            }
          }
        }
        // If there are still delimiters left, and the delimiter run can open, push it on the stack
        if (delimCount && canOpen) {
          stack.push({
            delimiter: currentDelimiter,
            delimString: delimString,
            count: delimCount,
            output: processed
          });
          processed = ''; // Current formatted output has been pushed on the stack and will be prepended when the stack gets popped
          delimCount = 0;
        }
  
        // Any delimiters that are left (closing unmatched) are appended to the output.
        if (delimCount) {
          processed = `${processed}${delimString.substr(0,delimCount)}`;
        }
  
        offset += cap[0].length;
        continue outer;
      }
  
      // Process 'default' rule
      cap = inlineGrammar.default.regexp.exec(string);
      if (cap) {
        string = string.substr(cap[0].length);
        offset += cap[0].length;
        processed += inlineGrammar.default.replacement
          // .replace(/\$\$([1-9])/g, (str, p1) => processInlineStyles(cap[p1])) // todo recursive calling
          .replace(/\$([1-9])/g, (str, p1) => htmlescape(cap[p1]));
        continue outer; 
      }
      throw 'Infinite loop!';
    }
  
    // Empty the stack, any opening delimiters are unused
    while (stack.length) {
      const entry = stack.pop();
      processed = `${entry.output}${entry.delimString.substr(0, entry.count)}${processed}`;
    }
  
    return processed;
  }

  /**
   * Updates the class properties (lines, lineElements) from the DOM.
   * @returns true if contents changed
   */
  updateLineContents() {
    let dirty = false;
    // Check if we have changed anything about the number of lines (inserted or deleted a paragraph)
    if (this.lines.length != this.e.childElementCount) {
      // yup. Recalculate everything
      this.lineElements = this.e.childNodes;
      this.lines = Array(this.lineElements.length);
      this.lineTypes = [];
      dirty = true;
    }
    for (let line = 0; line < this.lineElements.length; line++) {
      let e = this.lineElements[line];
      let ct = e.textContent;
      if (this.lines[line] !== ct) {
        // Line changed, update it
        this.lines[line] = ct;
        dirty = true;
      }
    }
    return dirty;
  }

  processNewParagraph(sel) {
    let continuableType = false;
    // Let's see if we need to continue a list
    if (sel && sel.row > 0) {
      switch (this.lineTypes[sel.row - 1]) {
        case 'TMUL': continuableType = 'TMUL'; break;
        case 'TMOL': continuableType = 'TMOL'; break;
        case 'TMIndentedCode': continuableType = 'TMIndentedCode'; break;
      }
    }
    // Update lines from content
    this.updateLineContents();
    if (continuableType) {
      // Check if the previous line was non-empty
      let capture = lineGrammar[continuableType].regexp.exec(this.lines[sel.row - 1]);
      if (capture) {
        // Convention: capture[1] is the line type marker, capture[2] is the content
        if (capture[2]) {
          // Previous line has content, continue the continuable type

          // Hack for OL: increment number
          if (continuableType == 'TMOL') {
            capture[1] = capture[1].replace(/\d{1,9}/, (result) => { return parseInt(result[0]) + 1});
          }
          this.lines[sel.row] = `${capture[1]}${this.lines[sel.row]}`;
          sel.col = capture[1].length;
        } else {
          // Previous line has no content, remove the continuable type from the previous row
          this.lines[sel.row - 1] = '';
        }     
      }
    }
    this.updateFormatting();
  }

  getSelection() {
    const selection = window.getSelection();
    let node = selection.focusNode;
    let col = node.nodeType === Node.TEXT_NODE ? selection.focusOffset : 0;
    while (node && node.parentNode != this.e) {
      if (node.previousSibling) {
        node = node.previousSibling;
        col += node.textContent.length;
      } else {
        node = node.parentNode;
      }
    }
    // Check that the selection was inside our text. If not, we'd have ascended to the root of the DOM (node == null)
    if (!node) {
      return null;
    }
    let row = 0;
    while (node.previousSibling) {
      row++;
      node = node.previousSibling;
    }
    return {row: row, col: col};
  }

  setSelection(para) {
    if (!para) return;
    let {row, col} = para; 
    if (row >= this.lineElements.length) {
      // Selection past the end of text, set selection to end of text
      row = this.lineElements.length - 1;
      col = this.lines[row].length;
    } 
    if (col > this.lines[row].length) {
      col = this.lines[row].length;
    }
    const parentNode = this.lineElements[row];
    let node = parentNode.firstChild;

    let range = document.createRange();
    let childrenComplete = false;

    while (node != parentNode) {
      if (!childrenComplete && node.nodeType === Node.TEXT_NODE) {
        if (node.nodeValue.length >= col) {
          this.log(`Selection at node, offset ${col}`, stringifyObject(node));
          range.selectNode(node);
          range.setStart(node, col);
          range.setEnd(node, col);
          range.collapse(false); // TODO do we need this with a simple selection?
          let selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          return;
        } else {
          col -= node.nodeValue.length;
        }
      } 
      if (!childrenComplete && node.firstChild) {
        node = node.firstChild;
      } else if (node.nextSibling) {
        childrenComplete = false;
        node = node.nextSibling;
      } else {
        childrenComplete = true;
        node = node.parentNode;
      }
    }

    // Somehow, the position was invalid; just keep it at the beginning of the line
    node = parentNode.firstChild ? parentNode.firstChild : parentNode;
    range.selectNode(node);
    range.collapse(true);
    let selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  /** 
   * Event handler for input events 
   */
  handleInputEvent(event) {
    let sel = this.getSelection();
    if (event.inputType == 'insertParagraph' && sel) {
      this.processNewParagraph(sel);
    } else {
      this.log(`INPUT at ${sel ? sel.row : '-'}:${sel ? sel.col : '-'}`, `EVENT\n${stringifyObject(event)}\n`);
      this.updateLineContentsAndFormatting();  
    }
    
    if (sel) this.setSelection(sel);

  }

  handleSelectionChangeEvent(event) {
    // this.log(`SELECTIONCHANGE`, `EVENT\n${stringifyEvent(event)}\n\nSELECTION\n${stringifyEvent(document.getSelection())}\n`);
  }

  handlePaste(event) {
    event.preventDefault();
  
    // get text representation of clipboard
    let text = (event.originalEvent || event).clipboardData.getData('text/plain');

    // insert text manually
    document.execCommand("insertText", false, text);
    let sel = this.getSelection();
    this.updateLineContentsAndFormatting();
    if (sel) this.setSelection(sel);
  
    // Prevent regular paste
    // return false;
  }

  // handleKeydownEvent(event) {
  //   this.log(`KEYDOWN`, stringifyEvent(event));
  // }

  log(message, details) {
    let e = document.createElement('details');
    let s = document.createElement('summary');
    let t = document.createTextNode(message);
    s.appendChild(t);
    e.appendChild(s);
    let c = document.createElement('code');
    let p = document.createElement('pre');
    t = document.createTextNode(details);
    c.appendChild(t);
    p.appendChild(c);
    e.appendChild(p);
    document.getElementById('log').appendChild(e);
    
  }


}

export default TinyMDE;