export const mathTuningSample = String.raw`---
document:
  title: "OpenType Math Tuning"
  abstract: "A compact specimen for adjusting native math metrics and inspecting parser, layout, preview, and PDF diagnostics."
typography:
  fontSize: 11
  lineHeight: 1.35
---

# Inline Math

Baseline checks: $E = mc^2$, $x_i^2 + y_i^2 = r^2$, $\alpha + \beta \approx \gamma$, and $\frac{a}{b} + \sqrt{x^2+y^2}$ should sit naturally beside text.

Accents and operators: $\hat{x}$, $\tilde{y}$, $\vec{v}$, $\bar{z}$, $\sum_{i=1}^{n}x_i$, and $\int_0^1 x^2\,dx$.

# Display Math

$$
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

$$
\int_0^1 x^2\,dx = \frac{1}{3}, \qquad
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$

$$
\begin{pmatrix} a & b \\ c & d \end{pmatrix}
\begin{pmatrix} x \\ y \end{pmatrix}
=
\begin{pmatrix} ax+by \\ cx+dy \end{pmatrix}
$$

$$
\left\langle \psi \middle| A \middle| \phi \right\rangle
= \frac{1}{\sqrt{2}}\left(\ket{0}+\ket{1}\right)
$$
`;
