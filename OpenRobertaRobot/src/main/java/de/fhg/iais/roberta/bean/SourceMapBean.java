package de.fhg.iais.roberta.bean;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Where the code for each block ended up in the generated source code: for every blockly id the block type and the character ranges [start, end) of
 * the code generated for it. A block can have more than one range, if the generator emits its code more than once (e.g. the list of "average").<br>
 * Offsets count chars of the final source code (Java/UTF-16 units). Filled by code generators that support it (currently the Edison generator) and used
 * by the unit test framework for NEPO programs to attribute runtime events of the generated program to blocks.
 */
public class SourceMapBean implements IProjectBean {
    private final Map<String, String> blockTypes = new LinkedHashMap<>();
    private final Map<String, List<int[]>> ranges = new LinkedHashMap<>();

    /**
     * add a range. Identical ranges of the same block are stored once: the AST wraps some phrases (e.g. an action in an ActionStmt), and both phrases
     * belong to the same block.
     */
    public void addRange(String blocklyId, String blockType, int start, int end) {
        this.blockTypes.putIfAbsent(blocklyId, blockType);
        List<int[]> rangesOfBlock = this.ranges.computeIfAbsent(blocklyId, k -> new ArrayList<>());
        for ( int[] range : rangesOfBlock ) {
            if ( range[0] == start && range[1] == end ) {
                return;
            }
        }
        rangesOfBlock.add(new int[] {start, end});
    }

    public Map<String, List<int[]>> getRanges() {
        return this.ranges;
    }

    public String getBlockType(String blocklyId) {
        return this.blockTypes.get(blocklyId);
    }

    /**
     * @return {"version": 1, "blocks": {"&lt;blockly id&gt;": {"type": "&lt;block type&gt;", "ranges": [[start, end], ...]}, ...}}
     */
    public JSONObject toJson() {
        JSONObject blocks = new JSONObject();
        for ( Map.Entry<String, List<int[]>> entry : this.ranges.entrySet() ) {
            JSONArray rangesOfBlock = new JSONArray();
            for ( int[] range : entry.getValue() ) {
                rangesOfBlock.put(new JSONArray().put(range[0]).put(range[1]));
            }
            blocks.put(entry.getKey(), new JSONObject().put("type", this.blockTypes.get(entry.getKey())).put("ranges", rangesOfBlock));
        }
        return new JSONObject().put("version", 1).put("blocks", blocks);
    }
}
