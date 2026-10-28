package com.dawnivers.be.config;

// ── ① 第三方：Jackson 解析 JSON + MyBatis 的类型处理器基类 ──
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;


// ── ② JDK：JDBC 四个接口 + 集合 ──
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

/**
 * jsonb 列（形如 ["a","b"] 的 JSON 文本） → List<String>
 *
 * 用途：poi.raw 里的 photos 数组，SQL 里用
 *       jsonb_path_query_array(raw, '$.photos[*].url')::text as photos
 * 取出来后是一段 JSON 字符串，本类负责把它解析成 List<String>。
 *
 * 只在「读取」方向使用，写入方向直接抛异常（photos 是只读派生字段）。
 */
public class StringListTypeHandler extends BaseTypeHandler<List<String>> {

    // ── ③ 类级常量：Jackson 解析器 + 目标泛型的字面量 ──
    // ObjectMapper 线程安全，做成 static final 复用，不要每次 new
    private static final ObjectMapper MAPPER = new ObjectMapper();

    // 泛型擦除对策：TypeReference 保留 List<String> 的泛型信息给 Jackson 用
    private static final TypeReference<List<String>> LIST_OF_STRING =
            new TypeReference<List<String>>() { };

    // ══════════════════════════════════════════════════════════
    // 以下四个方法由 BaseTypeHandler 声明为 abstract，必须实现
    // ══════════════════════════════════════════════════════════

    /**
     * 写入方向的唯一抽象方法：把 Java 值写进 PreparedStatement。
     * 本例不支持写入（photos 是查询结果，不参与 insert/update）。
     */
    @Override
    public void setNonNullParameter(PreparedStatement ps, int i,
                                    List<String> parameter, JdbcType jdbcType)
            throws SQLException {
        throw new UnsupportedOperationException(
                "StringListTypeHandler 仅支持读取，不支持写回数据库");
    }

    /**
     * 读取方向 ①：按【列名】取值 —— 你最常用的一条路。
     * MyBatis 解析 <arg column="photos" .../> 时走这里。
     */
    @Override
    public List<String> getNullableResult(ResultSet rs, String columnName)
            throws SQLException {
        return parse(rs.getString(columnName));
    }

    /**
     * 读取方向 ②：按【列序号】取值（从 1 开始）。
     * 某些场景（存储过程 / 动态列 / 无列名）会走这里。
     */
    @Override
    public List<String> getNullableResult(ResultSet rs, int columnIndex)
            throws SQLException {
        return parse(rs.getString(columnIndex));
    }

    /**
     * 读取方向 ③：从 CallableStatement（存储过程）取值。
     * 本项目暂时不用，但必须实现。
     */
    @Override
    public List<String> getNullableResult(CallableStatement cs, int columnIndex)
            throws SQLException {
        return parse(cs.getString(columnIndex));
    }

    // ══════════════════════════════════════════════════════════
    // 私有工具方法：JSON 文本 → List<String>
    // ══════════════════════════════════════════════════════════

    /**
     * 三个 getNullableResult 的公共解析逻辑。
     *
     * 三条规则：
     *   1) null / 空串 → 空列表（保证契约「键永远存在」，前端拿到 [] 不是 null）
     *   2) 正常 JSON 数组 → 解析成 List<String>
     *   3) 解析失败 → 抛 SQLException（带原始 JSON 片段，方便排查）
     */
    private List<String> parse(String json) throws SQLException {
        // ① 空值兜底：SQL 里 photos 可能因数据缺失返回 null
        if (json == null || json.isBlank()) {
            return List.of();
        }
        // ② 正常解析
        try {
            return MAPPER.readValue(json, LIST_OF_STRING);
        } catch (Exception e) {
            // ③ 坏数据要在日志里留证据，不要静默吞掉返回 []
            String preview = json.length() > 200 ? json.substring(0, 200) + "..." : json;
            throw new SQLException(
                    "photos 字段 JSON 解析失败，原始值: " + preview, e);
        }
    }
}